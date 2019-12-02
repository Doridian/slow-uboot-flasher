const FILENAME = './upgrade-1.0.1.bin';
const COMPORT = 'COM8';

const fs = require('fs');
const SerialPort = require('serialport');
const port = new SerialPort(COMPORT, {
  baudRate: 115200,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  rtscts: false,
  xon: false,
  xoff: false,
  xany: false,
  autoOpen: true,
});

console.log('Prepping FW...');

const file = fs.readFileSync(FILENAME);

const fileData = [];

function gf(j) {
    if (j >= file.byteLength) {
        return '00';
    }
    return ('00'+(file[j].toString(16))).substr(-2);
}

for (let i = 0; i < file.byteLength; i += 4) {
    fileData.push(
        gf(i) + gf(i+1) + gf(i+2) + gf(i+3)
    );
}

const firmware_size = `0x${file.byteLength.toString(16)}`;

console.log(`FW prepared. Size = ${firmware_size}. Begin FLASH!`);

let pokeInternal = setInterval(() => { port.write('.\n'); }, 5000);

let lineNo = 0;

let lastData = '';
let curData = '';
port.on('data', (data) => {
    data = data.toString('ascii');
    process.stdout.write(data);

    curData += data;

    if (curData.includes('autobooting')) {
        port.write('.\n');
        curData = '';
    }

    if (curData.includes('uboot>')) {
        if (pokeInternal !== undefined) {
            clearInterval(pokeInternal);
            pokeInternal = undefined;
        }

        if (lineNo === 0) {
            port.write('mm.l $loadaddr\n');
        } else if (lineNo === -1) {
            port.write(`erase $firmware_addr +${firmware_size}\n`);
            lineNo = -2;
        } else if (lineNo === -2) {
            port.write(`cp.b $loadaddr $firmware_addr ${firmware_size}\n`);
            lineNo = -3;
        } else if (lineNo === -3) {
            port.close();
        } else {
            console.error('\nINVALID\n');
            process.exit(1);
        }
        curData = '';
    } else if (curData.includes('?') && lineNo >= 0) {
        if (lastData && curData.trim().substr(0, 8) !== lastData) {
            console.error('\nCorruption!', '|' + curData.substr(0, 8) + '|', '!==', '|' + lastData + '|\n');
            process.exit(1);
        }
        if (lineNo >= fileData.length) {
            lineNo = -1;
            port.write('.\n');
            curData = '';
            return;
        }

        lastData = fileData[lineNo];
        lineNo++;
        curData = '';
        port.write(lastData + '\n');
    }
});

port.write('.\n');
