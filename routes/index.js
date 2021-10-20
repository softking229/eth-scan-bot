import express from 'express'
import { opensea_address, topic_orders_matched } from '../consts.js';
import { fetch_transactions } from '../controllers/TransactionController.js';

const router = express.Router();

// find transaction logs with one's wallet address
router.get('/api/wallet-watch/:wallet_address', async (req, resp) => {
    const wallet = req.params.wallet_address;
    let params = {
        module: "logs",
        action: "getLogs",
        address: opensea_address,
        topic0: topic_orders_matched,
        fromBlock: 0,
        toBlock: 'latest',
    };
    let tx_list = await fetch_transactions(params, wallet);
    resp.json(tx_list);
});

export default router;