"use strict";


const schedule = require("node-schedule");

const utils = require("@iobroker/adapter-core");

const fs = require("fs");
//const path = require('path');


// const registerOften = {};
// const registerRar = {};
// const registerDayly = {};

const Modbus = require("jsmodbus");
const { SerialPort } = require("serialport");
const socket = new SerialPort({ path: "/dev/ttyUSB0", baudRate: 9600 });
//const socket = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, autoOpen: true });
const client = new Modbus.client.RTU(socket, 1);

// let counter = 0;
// let ActivePower_Load_Sys = 0;
// let ActivePower_Load_Total = 0;
// let ActivePower_Output_Total = 0;
// let ActivePower_PCC_Total = 0;
// let SysState = 0;
// let Power_PV1 = 0;
// let Power_Bat1 = 0;

//const calcStates = ["Bat2House", "PV2Bat", "Net2Bat", "PV2Net", "PV2House", "Net2House"];

class SofarsolarHyd extends utils.Adapter {

	channelList = ["Seconds", "Minutes", "Hours", "Daily", "StartUp", "Calculated"];
	defaultRegister = [
		{ "regAdr": "1" },
		{ "regAdr": "2" },
		{ "regAdr": "3" },
		{ "regAdr": "4" },
		{ "regAdr": "5" },
		{ "regAdr": "6" },
		{
			"regAdr": "485",
			"loop": "Seconds"
		},
		{
			"regAdr": "488",
			"loop": "Seconds"
		},
		{
			"regAdr": "4AF",
			"loop": "Seconds"
		},
		{
			"regAdr": "504",
			"loop": "Seconds"
		},
		{
			"regAdr": "586",
			"loop": "Seconds"
		},
		{
			"regAdr": "589",
			"loop": "Seconds"
		},
		{
			"regAdr": "606",
			"loop": "Seconds"
		},
		{
			"regAdr": "60D",
			"loop": "Seconds"
		}];

	bat2House = 1;
	pv2Bat = 2;
	net2Bat = 3;
	pv2Net = 4;
	pv2House = 5;
	net2House = 6;
	activePower_Output_Total = 1157;
	activePower_PCC_Total = 1160;
	activePower_Load_Sys = 1199;
	activePower_Load_Total = 1284;
	power_PV1 = 1414;
	power_PV2 = 1417;
	power_Bat1 = 1542;
	power_Bat2 = 1549;


	seconds = "Seconds";
	minutes = "Minutes";
	hours = "Hours";
	daily = "Daily";
	startUp = "StartUp";
	optional = "Optional";
	calculated = "Calculated";

	regBuffer = new ArrayBuffer(80);
	dataFilePath = "";
	loopTasks = [this.seconds];
	avgCount = 0;
	loopTasksChanged = false;
	loopObject = {};
	registerList = {};
	calcRegisterList = {
		"1": {
			"Field": "Bat2House",
			"Accuracy": 1,
			"Unit": "W",
		},
		"2": {
			"Field": "PV2Bat",
			"Accuracy": 1,
			"Unit": "W",
		},
		"3": {
			"Field": "Net2Bat",
			"Accuracy": 1,
			"Unit": "W",
		},
		"4": {
			"Field": "PV2Net",
			"Accuracy": 1,
			"Unit": "W",
		},
		"5": {
			"Field": "PV2House",
			"Accuracy": 1,
			"Unit": "W",
		},
		"6": {
			"Field": "Net2House",
			"Accuracy": 1,
			"Unit": "W",
		}
	};

	loopInfo = {

		Seconds: [],
		Minutes: [],
		Hours: [],
		Daily: [],
		Optional: [],
		StartUp: []
	};


	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */


	constructor(options) {
		super({
			...options,
			name: "sofarsolar_hyd",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}


	/** Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	* Using this method requires "common.messagebox" property to be set to true in io-package.json
	* @param {ioBroker.Message} obj
	*/
	onMessage(obj) {

		this.log.error(`onMessage erreicht, empfangenes Objekt: ${JSON.stringify(obj)}`);
		//if (typeof obj === 'object' && obj.message) {
		if (typeof obj === "object") {
			//             // e.g. send email or pushover or whatever
			if (obj.command === "nu") {
				if (obj.callback) {
					try {
						const { SerialPort } = require("serialport");
						if (SerialPort) {
							//this.log.debug(`serialport vorhanden`);
							// read all found serial ports
							SerialPort.list()
								.then(ports => {
									//this.log.debug(`List of port: ${ JSON.stringify(ports) } `);
									this.sendTo(obj.from, obj.command, ports.map(item => ({ label: item.path, value: item.path })), obj.callback);
								})
								.catch(e => {
									this.sendTo(obj.from, obj.command, [], obj.callback);
									this.log.error(e);
								});
						} else {
							//this.log.error('Module serialport is not available');
							this.sendTo(obj.from, obj.command, [{ label: "Not available", value: "" }], obj.callback);
						}
					} catch (e) {
						this.sendTo(obj.from, obj.command, [{ label: "Not available", value: "" }], obj.callback);
					}
				}
			}
			//             // Send response in callback if required
		}
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		let temp = "";
		//this.log.error("onready erreicht");
		/*
				for (const i in this.channelList) {
					await this.delObjectAsync(this.namespace+"." +this.channelList[i], { recursive: true });
					this.log.error(`chanel löschen -> ${JSON.stringify(this.namespace+"." +this.channelList[i])}`);
				}
				*/
		this.loopTasksChanged = true;
		this.setState("info.connection", false, true);
		this.avgCount = this.config.autocomplete2;

		temp = "*/" + this.config.autocomplete3 + " * * * *";
		schedule.scheduleJob(temp, () => { this.loopTasks.push(this.minutes); this.loopTasksChanged = true; });

		temp = "0 */" + this.config.autocomplete4 + " * * *";
		schedule.scheduleJob(temp, () => { this.loopTasks.push(this.hours); this.loopTasksChanged = true; });

		schedule.scheduleJob("* 59 23 * *", () => { this.loopTasks.push(this.daily); this.loopTasksChanged = true; });

		this.dataFilePath = utils.getAbsoluteDefaultDataDir() + "files/" + this.config.filename1;
		//this.log.error(`dataFilePath) -> ${JSON.stringify(this.dataFilePath)}`);


		//this.log.error(`aus Tabelle gelesen -> ${JSON.stringify(this.config.table)}`);
		await this.parseTable();

		// this.log.error(`utils.getAbsoluteInstanceDataDir(this) -> ${JSON.stringify(utils.getAbsoluteInstanceDataDir(this))}`);
		// this.log.error(`utils.getAbsoluteDefaultDataDir() -> ${JSON.stringify(utils.getAbsoluteDefaultDataDir())}`);
		// this.log.error(`utils.controllerDir -> ${JSON.stringify(utils.controllerDir)}`);
		// this.log.error(`dataFolder -> ${JSON.stringify(this.common?.dataFolder)}`);
		// this.log.error(`jsonFile -> ${JSON.stringify(this.config.filename1)}`);
		// this.log.error(`config -> ${JSON.stringify(this.config)}`);
		//this.namespace
		// this.host -
		// this.FORBIDDEN_CHARS -
		// this.namespace - Der komplette Namespace im Format. z.B. admin.0
		// this.instance - Die Instanznummer als numerischer Wert. z.B. 0
		// this.adapterDir - Der abolute Pfad zum Adapter-Verzeichnis (innerhalb node_modules)
		// this.ioPack - Die io-package.json als Objekt

		//const allObjects = await this.getAdapterObjectsAsync(); // Alle folder, device, channel und state Objekte
		//const allObjects = await this.getAdapterObjectsAsync(); // Alle folder, device, channel und state Objekte
		//this.log.error(`allObjects -> ${JSON.stringify(allObjects)}`);
		//this.log.error(`dataFilePath) -> ${JSON.stringify(this.dataFilePath)}`);
		//this.log.error(`registerList -> ${JSON.stringify(this.registerList)}`);


		//this.loop();


		//socket.on('error', (err) => { this.log.error('Error: ' + err.message); });
		//socket.on('open', () => { this.log.error('Port geöffnet '); });

		//this.interval1 = this.setInterval(() => this.loop_ask(), 5000);
		//this.interval1 = this.setInterval(() => this.readChecked(), 5000);


		//this.log.info(`config this.config: ${ JSON.stringify(this.config) } `);

		//await this.makeStatesFromArray(calcStates, "CalculatedStates");
		//this.fillRegisterObjects().then(() => this.readFromObject());

		//        this.setTimeout(() => { this.readFromObject(); }, 8000);

		/* const job = schedule.scheduleJob('42 * * * *', function(){
			 this.log.('The answer to life, the universe, and everything!');
		   });
		   */


		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		//this.subscribeStates('testVariable');
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates('lights.*');
		//await this.setStateAsync('testVariable', true);
		//await this.setStateAsync('testVariable', { val: true, ack: true });
		//await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			schedule.gracefulShutdown();

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}
	//################################################################################################################
	//#####################    Meine Funktionen  #####################################################################
	//################################################################################################################

	async loop() {
		//this.log.error("loop erreicht");
		if (this.loopTasksChanged) {
			//this.log.error("loopTaskChanged");
			this.loopObject = this.createLoopObject(this.loopTasks);
		}
		if (this.loopTasks.length > 1) {
			//this.log.error("loopTasks.length>1");

			//this.log.error(`task  ${JSON.stringify(this.loopTasks)}`);
			//this.log.error(`task  ${JSON.stringify(this.loopInfo)}`);
			//this.log.error(`task in blocks and regs  ${JSON.stringify(this.loopObject)}`);
		}
		//this.log.error(`loopObjekt :   ${JSON.stringify(this.loopObject)}`);

		for (const block in this.loopObject) {
			//this.log.error(`block :   ${JSON.stringify(block)}`);
			//this.log.error(`liste :   ${JSON.stringify(this.loopObject[block])}`);
			if (Number(block) > 100) {
				await client.readHoldingRegisters(Number(block), 0x40)
					.then((resp) => this.parseBuffer(resp.response._body._valuesAsBuffer, this.loopObject[block]))
					.then(() => this.delay(20))
					.catch((resp) => { this.log.error(` : Stimmt was nicht: ${JSON.stringify(resp)} `); socket.connect({ path: "/dev/ttyUSB0", baudRate: 9600 }); });
			}
		}
		//this.log.error(`registerlist :   ${JSON.stringify(this.registerList)}`);

		this.calcStates();

		await this.actualiceReadings().catch((resp) => { this.log.error(`actualiceReadings : Stimmt was nicht: ${JSON.stringify(resp)} `); });

		this.log.error(` registerList: ${JSON.stringify(this.registerList)} `);


		if (this.loopTasks.length > 1) {
			this.loopTasks = [this.seconds];
			this.loopTasksChanged = true;
		}
		else {
			this.loopTasksChanged = false;
		}
		this.setTimeout(() => { this.loop(); }, 5000);
	}

	async actualiceReadings() {
		//this.log.error("actualiceReadings erreicht");
		//this.log.error(`loopObject :   ${JSON.stringify(this.loopObject)}`);

		for (const block in this.loopObject) {
			//this.log.error(`block :   ${JSON.stringify(block)}`);
			for (const reg of this.loopObject[block]) {
				//this.log.error(`Register :   ${JSON.stringify(reg)}`);
				if (this.registerList[reg].reading) {
					const name = this.registerList[reg].regPath + "." + this.registerList[reg].regName;
					//this.log.error(`Pfad + Name :   ${JSON.stringify(name)}`);

					await this.setStateAsync(name, this.registerList[reg].regValue, true);
				}
			}
		}
	}


	async parseBuffer(buf, liste) {
		// this.log.error("parseBuffer erreicht");
		// this.log.error(`buf :   ${JSON.stringify(buf)}`);
		// this.log.error(`liste :   ${JSON.stringify(liste)}`);
		for (const register of liste) {
			let val = 0;
			//this.log.error(`register :   ${JSON.stringify(register)}`);
			const relAdr = (register % 0x40) * 2;
			const type = this.registerList[register].regType;
			const fktr = Number(this.registerList[register].regAccuracy);
			switch (type) {
				case "I16":
					val = buf.readInt16BE(relAdr) * fktr;
					//this.log.error("i16");
					break;
				case "U16":
					val = buf.readUInt16BE(relAdr) * fktr;
					break;
				case "U32":
					val = buf.readUInt32BE(relAdr) * fktr;
					break;
				case "U64":
					val = buf.readBigUInt64BE(relAdr) * fktr;
					break;
			}
			if (!this.registerList[register].mw) {
				this.registerList[register].regValue = val;
			}
			else {
				this.registerList[register].regValue -= ((this.registerList[register].regValue - val) / this.avgCount);
			}
		}
		//this.log.error("relAdr : " + relAdr + " register : " + register + "  faktor : " + fktr + "  val : " + val + "  type : " + type);

	}


	//################################################################################################################



	/*
	combineTasks(tasks) {
		let temp = {};
		for (let task of tasks) {
			//this.log.error(`Combine task:  ${JSON.stringify(task)}  mit registern:  ${JSON.stringify(this.loopInfo[task])} `);
			//console.log("task : " + task);
			for (let block in this.loopInfo[task]) {
		
				//console.log("block : " + block);
				if (temp[block] == undefined) {
					temp[block] = this.loopInfo[task][block];
				}
				else {
					temp[block] = temp[block].concat(this.loopInfo[task][block]);
				}
				temp[block] = [...new Set(temp[block])];
			}
		}
		//console.log(` tempinfo: ${JSON.stringify(temp)} `);
		return temp;
	}
		
	*/

	createLoopObject(tasks) {
		const tempObj = {};
		let tempArray = [];
		for (const task of tasks) {
			tempArray = tempArray.concat(this.loopInfo[task]);
		}
		tempArray = [...new Set(tempArray)];

		for (const i in tempArray) {
			//console.log(reg[i]);
			const c = (tempArray[i] - tempArray[i] % 0x40);
			//console.log(c);
			if (tempObj[c]) {
				// console.log(' cluster existiert');
				tempObj[c].push(tempArray[i]);
			}
			else {
				// console.log('cluster existiert nicht');
				tempObj[c] = [tempArray[i]];
			}
		}
		return tempObj;
	}

	/*
		setMinuteLoop() {
			this.loopTasks.push(this.minutes);
			this.loopTasksChanged = true;
		}
		setHourLoop() {
			this.loopTasks.push(this.hours);
			this.loopTasksChanged = true;
		}
		setDayliLoop() {
			this.loopTasks.push(this.daily);
			this.loopTasksChanged = true;
		}
	
	*/
	/*
		async splitter2(resp, arr) {
			//const buf = Buffer.from(resp.response._body._valuesAsBuffer);
			const buf = Buffer.from(resp);
			this.log.silly(`splitter2: resp: ${JSON.stringify(resp)} , array:  ${JSON.stringify(arr)}  `);
			for (const register of arr) {
				const addr = (register.regNrRel) * 2;
				const fktr = register.regAccuracy;
				this.log.silly(`const: ${JSON.stringify(register)}  arr_const    ${JSON.stringify(register.regName)} `);
				this.log.silly(register.regPath + register.regName + "  : " + (addr) + "  accuracy : " + register.regAccuracy + "  fktr : " + fktr + " typeof : " + typeof (register.regAccuracy) + " typeof fktr : " + typeof (fktr));
				let val = 0;
				const name = register.regPath + register.regName;
				if (register.regType == "I16") {
					val = buf.readInt16BE(addr) / fktr;
				}
				else if (register.regType == "U16") {
					val = buf.readUint16BE(addr) / fktr;
				}
				else if (register.regType == "U32") {
					val = buf.readUint32BE(addr) / fktr;
				}
				else if (register.regType == "U64") {
					//val= buf.readBigUInt64BE(addr);
				}
				await this.setStateAsync(name, val, true);
				switch (register.regName) {
					case "ActivePower_Load_Sys":
						ActivePower_Load_Sys = val;
						break;
					case "ActivePower_Load_Total":
						ActivePower_Load_Total = val;
						break;
					case "ActivePower_Output_Total":
						ActivePower_Output_Total = val;
						break;
					case "ActivePower_PCC_Total":
						ActivePower_PCC_Total = val;
						break;
					case "SysState":
						SysState = val;
						break;
					case "Power_PV1":
						Power_PV1 = val;
						break;
					case "Power_Bat1":
						Power_Bat1 = val;
						break;
				}
	
			}
		}
	
	*/
	calcStates() {
		// if (SysState == 7) {
		// 	//val = 0;
		// }
		//else 
		{
			if (this.registerList[this.power_Bat1].regValue < 0) {
				this.registerList[this.bat2House].regValue = this.registerList[this.power_Bat1].regValue * 1000;
				this.registerList[this.pv2Bat].regValue = 0;
			}
			else {
				this.registerList[this.bat2House].regValue = 0;
				this.registerList[this.pv2Bat].regValue = this.registerList[this.power_Bat1].regValue * 1000;
			}

			if (this.registerList[this.activePower_PCC_Total].regValue > 0) {
				if (this.registerList[this.power_PV1].regValue > 0) {
					this.registerList[this.net2House].regValue = 0;//Hausbezug
					this.registerList[this.pv2Net].regValue = this.registerList[this.activePower_PCC_Total].regValue * 1000;//PVEinspeisung
				}
				else {
					this.registerList[this.pv2Net].regValue = 0;
					this.registerList[this.net2House].regValue = this.registerList[this.activePower_PCC_Total].regValue * 1000;
				}
			}
			else {
				this.registerList[this.net2House].regValue = -this.registerList[this.activePower_PCC_Total].regValue * 1000;
				this.registerList[this.pv2Net].regValue = 0;
			}


			this.registerList[this.pv2House].regValue = this.registerList[this.power_PV1].regValue * 1000 - this.registerList[this.pv2Bat].regValue - this.registerList[this.pv2Net].regValue;
		}
	}

	delay(t, val) {
		return new Promise(resolve => setTimeout(resolve, t, val));
	}

	async readFromObject() {
		//this.log.error("readfromobject erreicht");
		let toRead = null;
		if (client.connectionState == "online") {

			if (counter < 6) {
				counter++;
				toRead = registerOften;
			}
			else {
				counter = 0;
				toRead = registerRar;
			}
			this.setStateAsync("info.connection", true, false);
			for (const r in toRead) {
				await client.readHoldingRegisters(Number(r), 0x40)
					.then((resp) => this.splitter2(resp.response._body._valuesAsBuffer, toRead[r]))
					.then(() => this.delay(20))
					.catch((resp) => { this.log.error(` : Stimmt was nicht: ${JSON.stringify(resp)} `); socket.connect({ path: "/dev/ttyUSB0", baudRate: 9600 }); });
				//this.log.debug(r.name + ' geschesked');
			}
		}
		else {
			this.log.error("Socket leider nicht IO");
			//socket.close().then(socket.open());
		}
		// this.log.error('fertig mit lesen');
		this.calcStates();
		this.setTimeout(() => { this.readFromObject(); }, 8000);
	}

	//empfangenes Objekt: {"command":"nu","message":null,"from":"system.adapter.admin.0","callback":{"message":null,"id":14,"ack":false,"time":1700482381104},"_id":12502332}




	/*
		parseText(str) {
			const txtArr = str.split("#");
			const regArr = [];
	
			const lenght = txtArr.length;
			if (lenght > 1) {
				for (let jjj = 1; jjj < lenght; jjj++) {
					const pos = txtArr[jjj].search("[^0-9a-fA-F]");
					if (pos > 0) {
						const sub = txtArr[jjj].substring(0, pos);
						regArr.push(parseInt(sub, 16));
					} else {
						regArr.push(parseInt(txtArr[jjj], 16));
					}
				}
			}
			return regArr;
		}
	
	*/


	async parseTable() {
		const path = this.dataFilePath;
		const data = fs.readFileSync(path).toLocaleString();
		let register_str = "";
		let register_nmbr = 0;
		let loopKind = "";
		let accuracy = 0;
		let set = {};
		if (!fs.existsSync(path)) {
			this.log.error("Datei fehlt");
		}
		else {
			const json = JSON.parse(data);
			this.defaultRegister = this.defaultRegister.concat(this.config.table);
			this.log.error(` defaultRegister: ${JSON.stringify(this.defaultRegister)} `);
			for (const entry of this.defaultRegister) {
				if ((entry["aktiv"] == true) || (entry["aktiv"] == undefined)) {
					register_nmbr = parseInt(entry["regAdr"], 16);
					register_str = register_nmbr.toString(16).toUpperCase().padStart(4, "0");
					loopKind = entry["loop"] || this.seconds;
					this.log.error(` entry: ${JSON.stringify(entry)} `);
					this.log.error(` loopkind: ${JSON.stringify(loopKind)} `);
					if (register_nmbr <= 100) {
						set = this.calcRegisterList[register_nmbr];
					}
					else {
						if (json[register_str] != undefined) { set = json[register_str]; }
						else { this.log.error(`Kein Registereintrag für  ${JSON.stringify(register_str)} `); continue; }
					}
					this.log.error(` set: ${JSON.stringify(set)} `);
					this.log.error(` entry: ${JSON.stringify(entry.regAdr)} `);
					accuracy = Number(set.Accuracy) || 1;
					if (accuracy == 0) { accuracy = 1; }
					this.registerList[register_nmbr] = {};
					//this.registerList[register_nmbr].loop = entry["loop"] || this.seconds;
					this.registerList[register_nmbr].mw = entry["mw"] || false;
					this.registerList[register_nmbr].reading = entry["reading"] || true;
					this.registerList[register_nmbr].desc = register_str + entry["optDescription"] || entry["loop"] || this.calculated;
					this.registerList[register_nmbr].regPath = entry["loop"] || this.calculated;
					this.registerList[register_nmbr].regName = set.Field;
					this.registerList[register_nmbr].regType = set.Typ || "";
					this.registerList[register_nmbr].regAccuracy = accuracy;
					this.registerList[register_nmbr].regUnit = set.Unit;
					this.registerList[register_nmbr].regAdrStr = register_str;
					this.registerList[register_nmbr].regValue = 0;
					this.loopInfo[loopKind].push(register_nmbr);
					if (this.registerList[register_nmbr].reading) {
						await this.createStateAsync("",
							this.registerList[register_nmbr].regPath,
							this.registerList[register_nmbr].regName,
							{ "role": "value", "name": register_str + "_" + this.registerList[register_nmbr].desc, type: "number", read: true, write: true, "unit": this.registerList[register_nmbr].regUnit })
							.catch(e => { this.log.error(`fehler bei createstateasync ${JSON.stringify(e)} `); });

					}
				}
			}
			this.log.error(` registerList: ${JSON.stringify(this.registerList)} `);
			this.log.error(` loopInfo: ${JSON.stringify(this.loopInfo)} `);
		}
	}

	arrayIncludesReg(arr, val) {
		let b = false;
		for (const i in arr) {
			// console.log('>>> ' + i+ '  : ' + arr[i].value + '   <<<  ' + val);
			if (arr[i].regNrRel == val) {
				b = true;
				break;
			}
		}
		//console.log(b);
		return b;
	}

	createRegName(i) {
		return i.toString(16).toUpperCase().padStart(4, "0");
	}

	addRegister(reg, obj) {
		for (const i in reg) {
			//console.log(reg[i]);
			const c = (reg[i] - reg[i] % 0x40);
			const relAdr = reg[i] % 0x40;
			//console.log(c);
			if (obj[c]) {
				// console.log(' cluster existiert');
				if (!this.arrayIncludesReg(obj[c], reg[i])) {
					// console.log('array einfügen');
					obj[c].push({ regNrRel: relAdr, regName: this.createRegName(reg[i]), regType: "", regAccuracy: 1 });
				}
			} else {
				// console.log('cluster existiert nicht');
				obj[c] = [{ regNrRel: relAdr, regNr: reg[i], regName: this.createRegName(reg[i]), regType: "", regAccuracy: 1 }];
			}
		}
	}

	fillLoopInfo(loop, textfeld) {
		let regs = this.parseText(this.config[textfeld]);
		this.loopInfo[loop] = regs;
	}
	/*
	
		async fillRegisterObjects() {
			//this.log.error("fillregisterobject erreicht");
			this.fillLoopInfo(this.entityLoop, "text1");
			this.fillLoopInfo(this.minuteLoop, "text2");
			this.fillLoopInfo(this.hourLoop, "text3");
			this.fillLoopInfo(this.dayliLoop, "text4");
			//this.log.error(` loopInfo: ${JSON.stringify(this.loopInfo)} `);
	
			this.addRegister(this.parseText(this.config.text1), registerOften);
			this.addRegister(this.parseText(this.config.text2), registerRar);
			this.addRegister(this.parseText(this.config.text3), registerDayly);
	
			await this.makeStatesFromRegister(registerOften, "ShortInterval");
			await this.makeStatesFromRegister(registerRar, "LongInterval");
			await this.makeStatesFromRegister(registerDayly, "Dayly");
		}
	
		async makeStatesFromRegister(obj, myPath) {
			const path = "/opt/iobroker/node_modules/iobroker.sofarsolar_hyd/lib/Mod_Register.json";
			const data = fs.readFileSync(path).toLocaleString();
			if (fs.existsSync(path)) {
				// this.log.error('Datei ist da');
			}
			else {
				// this.log.error('Datei fehlt');
			}
			const json = JSON.parse(data);
			//this.log.info(myPath + ` :  ${JSON.stringify(obj)} `);
			for (const cluster in obj) {
				//this.log.error(cluster + `obj_cluster:  :  ${JSON.stringify(obj[cluster])} `);
				for (const reg in obj[cluster]) {
					//this.log.error(reg + `obj_cluster_reg:  ${JSON.stringify(obj[cluster][reg])} `);
					//this.log.error(`regname:  ${JSON.stringify(obj[cluster][reg].regName)} `);
	
					if (json[obj[cluster][reg].regName] == undefined) { this.log.error("gibtsnet"); obj[cluster].splice(reg, 1); break; }
					const desc = "0x" + obj[cluster][reg].regName + "_" + json[obj[cluster][reg].regName].Field;
					const name = json[obj[cluster][reg].regName].Field || obj[cluster][reg].regName;
					const unit = json[obj[cluster][reg].regName].Unit;
					//parseFloat($("#fullcost").text().replace(',', '.'));
					const accuracy = Math.trunc(1 / parseFloat(json[obj[cluster][reg].regName].Accuracy.replace(",", ".")));
					const typ = json[obj[cluster][reg].regName].Typ;
					obj[cluster][reg].regName = name;
					obj[cluster][reg].regType = typ;
					obj[cluster][reg].regAccuracy = accuracy || 1;
					obj[cluster][reg].regPath = myPath + ".";
					await this.createStateAsync("", myPath, name, { "role": "value", "name": desc, type: "number", read: true, write: true, "unit": unit })
						//.then(e => { this.log.debug(`geschafft ${ JSON.stringify(e) } `); })
						.catch(e => { this.log.error(`fehler ${JSON.stringify(e)} `); });
				}
			}
			// this.log.info(myPath + ` :  ${ JSON.stringify(obj) } `);
	
		}
	
		async makeStatesFromArray(obj, myPath) {
			for (const reg in obj) {
				const name = obj[reg];
				const unit = "W";
				const desc = "xxx";
				await this.createStateAsync("", myPath, name, { "role": "value", "name": desc, type: "number", read: true, write: true, "unit": unit })
					.catch(e => { this.log.error(`fehler ${JSON.stringify(e)} `); });
			}
		}
	*/
	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }
}



if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SofarsolarHyd(options);
} else {
	// otherwise start the instance directly
	new SofarsolarHyd();
}


/*

const utils = require('@iobroker/adapter-core');

const dataDir = utils.getAbsoluteDefaultDataDir();
// liefert (unter Linux) z.B. /opt/iobroker/iobroker-data/

const instanceDir = utils.getAbsoluteInstanceDataDir(this);
// liefert (unter Linux) z.B. /opt/iobroker/iobroker-data/<adapterName>.<instanceNr>

*/