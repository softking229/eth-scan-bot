import fetch from "node-fetch"
import hex2dec from 'hex2dec'


var get_transaction_history = async() => {
    console.log('checking', new Date());
    // var lastblock = await getLastBlock();
    var startblock = 13447300;
    var url = 'https://api.etherscan.io/api?module=logs&sort=desc' + '&apikey='+ process.env.API_KEY + '&address=' + process.env.ADDRESS + "&fromBlock=" + 13447518 + "&toBlock="+13447519;
    const resp = await fetch( url + '&action=getLogs' + '&topic0=' + process.env.TOPIC);
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