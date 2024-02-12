"use strict";


const schedule = require("node-schedule");

const utils = require("@iobroker/adapter-core");

const fs = require("fs");
//const path = require('path');


const registerOften = {};
const registerRar = {};
const registerDayly = {};

const Modbus = require("jsmodbus");
const { SerialPort } = require("serialport");
const socket = new SerialPort({ path: "/dev/ttyUSB0", baudRate: 9600 });
//const socket = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, autoOpen: true });
const client = new Modbus.client.RTU(socket, 1);

let counter = 0;
let ActivePower_Load_Sys = 0;
let ActivePower_Load_Total = 0;
let ActivePower_Output_Total = 0;
let ActivePower_PCC_Total = 0;
let SysState = 0;
let Power_PV1 = 0;
let Power_Bat1 = 0;

const calcStates = ["Bat2House", "PV2Bat", "Net2Bat", "PV2Net", "PV2House", "Net2House"];

class SofarsolarHyd extends utils.Adapter {

	entityLoop = "entityLoop";
	minuteLoop = "minuteLoop";
	hourLoop = "hourLoop";
	dayliLoop = "dayliLoop";
	optionalLoop = "optionalLoop";

	regBuffer = new ArrayBuffer(80);
	loopTasks = [this.entityLoop];
	loopCounter = 0;
	avgCount = 0;
	//registerCollection = [];
	loopTasksChanged = false;
	loopObject = {};
	registerList = {};

	loopInfo = {

		entityLoop: [],
		minuteLoop: [],
		hourLoop: [],
		dayliLoop: [],
		optionalLoop: []
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

		//this.log.debug('onMessage erreicht, empfangenes Objekt: ${JSON.stringify(obj)}');
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
		await this.delObjectAsync("sofarsolar_hyd.0.LongInterval", { recursive: true });
		await this.delObjectAsync("sofarsolar_hyd.0.ShortInterval", { recursive: true });
		await this.delObjectAsync("sofarsolar_hyd.0.CalculatedStates", { recursive: true });
		this.loopTasksChanged = true;
		this.setState("info.connection", false, true);
		this.avgCount = this.config.autocomplete2;

		temp = "*/" + this.config.autocomplete3 + " * * * *";
		schedule.scheduleJob(temp, () => { this.setMinuteLoop(); });

		temp = "0 */" + this.config.autocomplete4 + " * * *";
		schedule.scheduleJob(temp, () => { this.setHourLoop(); });

		schedule.scheduleJob("* 59 23 * *", () => { this.setDayliLoop(); });

		//this.log.error(`aus Tabelle gelesen -> ${JSON.stringify(this.config.table)}`);
		this.parseTable();

		this.loop();
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
		//let average = false;
		this.loopCounter++;
		if (this.loopCounter > 2) {
			this.loopCounter = 0;
			//average = true;
			//this.log.error("average");

		}
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

			await client.readHoldingRegisters(Number(block), 0x40)
				.then((resp) => this.parseBuffer(resp.response._body._valuesAsBuffer, this.loopObject[block]))
				.then(() => this.delay(20))
				.catch((resp) => { this.log.error(` : Stimmt was nicht: ${JSON.stringify(resp)} `); socket.connect({ path: "/dev/ttyUSB0", baudRate: 9600 }); });

		}
		//this.log.error(`registerlist :   ${JSON.stringify(this.registerList)}`);
		await this.actualiceReadings().catch((resp) => { this.log.error(`actualiceReadings : Stimmt was nicht: ${JSON.stringify(resp)} `); });


		if (this.loopTasks.length > 1) {
			this.loopTasks = ["entityLoop"];
			this.loopTasksChanged = true;
		}
		else {
			this.loopTasksChanged = false;
		}
		this.setTimeout(() => { this.loop(); }, 5000);
	}

	async actualiceReadings() {
		this.log.error("actualiceReadings erreicht");
		this.log.error(`loopObject :   ${JSON.stringify(this.loopObject)}`);

		for (const block in this.loopObject) {
			this.log.error(`block :   ${JSON.stringify(block)}`);
			for (const reg in this.loopObject[block]) {
				this.log.error(`Register :   ${JSON.stringify(block[reg])}`);

				if (this.registerList[reg].reading) {
					const name = this.registerList[reg].regPath + this.registerList[reg].regName;
					this.log.error(`Pfad + Name :   ${JSON.stringify(name)}`);

					await this.setStateAsync(name, this.registerList[reg].value, true);
				}
			}
		}
	}


	async parseBuffer(buf, liste) {
		//this.log.error("parseBuffer erreicht");
		//this.log.error(`buf :   ${JSON.stringify(buf)}`);
		//this.log.error(`liste :   ${JSON.stringify(liste)}`);
		for (const register of liste) {
			let val = 0;
			//this.log.error(`register :   ${JSON.stringify(register)}`);
			const relAdr = (register % 0x40) * 2;
			const type = this.registerList[register].regType;
			const fktr = Number(this.registerList[register].regAccuracy);
			switch (type) {
				case "I16":
					val = buf.readInt16BE(relAdr) * fktr;
					this.log.error("i16");
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
			this.registerList[register].value = val;
			//this.log.error("relAdr : " + relAdr + " register : " + register + "  faktor : " + fktr + "  val : " + val + "  type : " + type);

		}

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
			const relAdr = tempArray[i] % 0x40;
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


	setMinuteLoop() {
		this.loopTasks.push(this.minuteLoop);
		this.loopTasksChanged = true;
	}
	setHourLoop() {
		this.loopTasks.push(this.hourLoop);
		this.loopTasksChanged = true;
	}
	setDayliLoop() {
		this.loopTasks.push(this.dayliLoop);
		this.loopTasksChanged = true;
	}


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


	async calcStates() {
		let Bat2House, PV2Bat, Net2House, PV2Net, PV2House;
		if (SysState == 7) {
			//val = 0;
		}
		else {
			if (Power_Bat1 < 0) {
				Bat2House = -Power_Bat1 * 1000;
				PV2Bat = 0;
			}
			else {
				Bat2House = 0;
				PV2Bat = Power_Bat1 * 1000;
			}
			await this.setStateAsync("sofarsolar_hyd.0.CalculatedStates.Bat2House", Bat2House, true);
			await this.setStateAsync("sofarsolar_hyd.0.CalculatedStates.PV2Bat", PV2Bat, true);

			if (ActivePower_PCC_Total > 0) {
				if (Power_PV1 > 0) {
					Net2House = 0;//Hausbezug
					PV2Net = ActivePower_PCC_Total * 1000;//PVEinspeisung
				}
				else {
					PV2Net = 0;
					Net2House = ActivePower_PCC_Total * 1000;
				}
			}
			else {
				Net2House = -ActivePower_PCC_Total * 1000;
				PV2Net = 0;
			}
			await this.setStateAsync("sofarsolar_hyd.0.CalculatedStates.Net2House", Net2House, true);
			await this.setStateAsync("sofarsolar_hyd.0.CalculatedStates.PV2Net", PV2Net, true);


			PV2House = Power_PV1 * 1000 - PV2Bat - PV2Net;
			await this.setStateAsync("sofarsolar_hyd.0.CalculatedStates.PV2House", PV2House, true);
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




	parseTable() {
		const path = "/opt/iobroker/node_modules/iobroker.sofarsolar_hyd/lib/Mod_Register.json";
		const data = fs.readFileSync(path).toLocaleString();
		let register_str = "";
		let register_nmbr = 0;
		let loopKind = "";
		let accuracy = 0;
		if (!fs.existsSync(path)) {
			this.log.error("Datei fehlt");
		}
		else {
			const json = JSON.parse(data);
			for (const entry of this.config.table) {
				register_nmbr = parseInt(entry["regAdr"], 16);
				register_str = register_nmbr.toString(16).toUpperCase().padStart(4, "0");
				loopKind = entry["loop"];
				//this.log.error(` entry: ${JSON.stringify(entry)} `);
				if (json[register_str] != undefined) {
					if (entry["aktiv"]) {
						//this.log.error(` entry: ${JSON.stringify(entry.regAdr)} `);
						accuracy = Number(json[register_str].Accuracy);
						if (accuracy == 0) { accuracy = 1; }
						this.registerList[register_nmbr] = {};
						this.registerList[register_nmbr].loop = entry["loop"];
						this.registerList[register_nmbr].mw = entry["mw"];
						this.registerList[register_nmbr].reading = entry["reading"];
						this.registerList[register_nmbr].desc = entry["optDescription"];
						this.registerList[register_nmbr].regPath = entry["regPath"];
						this.registerList[register_nmbr].regName = json[register_str].Field;
						this.registerList[register_nmbr].regType = json[register_str].Typ;
						this.registerList[register_nmbr].regAccuracy = accuracy;
						this.registerList[register_nmbr].regUnit = json[register_str].Unit;
						this.registerList[register_nmbr].regAdrStr = register_str;
						this.registerList[register_nmbr].regValue = 0;
						this.loopInfo[loopKind].push(register_nmbr);
					}
				}
				else {
					this.log.error(` Eintrag-> ${JSON.stringify(register_str)} <- wurde nicht in Datei gefunden`);
				}
			}
			//this.log.error(` registerList: ${JSON.stringify(this.registerList)} `);
			//this.log.error(` loopInfo: ${JSON.stringify(this.loopInfo)} `);
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
