import express from 'express'
import { opensea_address, topic_orders_matched } from '../consts.js';
import { fetch_transactions } from '../controllers/TransactionController.js';

const router = express.Router();

// find transaction logs with one's wallet address
router.get('/api/wallet-watch/:wallet_address', async (req, resp) => {
    const wallet = req.params.wallet_address;
    let wallet_address = `0x${"0".repeat(24)}${wallet.substr(2)}`;
    let params = {
        module: "logs",
        action: "getLogs",
        address: opensea_address,
        topic0: topic_orders_matched,
        topic1: wallet_address,
        fromBlock: 0,
        toBlock: 'latest',
    };
    let tx_buy = await fetch_transactions(params, wallet);
    delete params.topic1;
    params.topic2 = wallet_address;
    let tx_sell = await fetch_transactions(params, wallet);
    resp.json(tx_buy.concat(tx_sell));
});

export default router;