import fetch from "node-fetch"
import hex2dec from 'hex2dec'
import fs from 'fs-extra'
import abiDecoder from 'abi-decoder'

const abi = fs.readJsonSync("abi.json");
const paramData = fs.readFileSync("data.txt", "utf-8");
abiDecoder.addABI(abi);
const buyCallData = abiDecoder.decodeMethod(paramData).params[3]['value'];
const token_number = buyCallData.substr(buyCallData.length - 64);

console.log(token_number);

var get_transaction_history = async() => {
    console.log('checking', new Date());
    const topic = '0xc4109843e0b7d514e4c093114b863f8e7d8d9a458c372cd51bfe526b588006c9';
    var url = 'https://api.etherscan.io/api?module=logs&sort=desc' + '&apikey='+ process.env.API_KEY + '&address=' + process.env.ADDRESS + "&fromBlock=" + 13447518 + "&toBlock="+13447519;
    const resp = await fetch( url + '&action=getLogs' + '&topic0=' + topic);
    const { result: nft_tx_list } = await resp.json();
    console.log(nft_tx_list);
    for(let nft_tx of nft_tx_list) {
        let from = nft_tx.topics[2];
        let to = nft_tx.topics[1];
        let price = hex2dec(data.substr(128));
        console.log(from, to, price);
    }
};

export default get_transaction_history;