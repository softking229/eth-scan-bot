import express from 'express'
import { opensea_address, topic_orders_matched } from '../consts.js';
import { fetch_transactions } from '../controllers/TransactionController.js';
import WatchList from "../Models/WatchList.js";

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

router.get('/api/profit-leaders', async ( req, resp) => {
    let sortField = req.query.sortField;
    let sortBy = req.query.sortBy;
    let page = req.query.page;
    let offset = 2;
    let sortQuery;
    let query = WatchList.find({});
    page = (page===undefined?1:page*1);
    sortBy = (sortBy=="asc"?1:-1);
    let skip = (page - 1) * offset;
    switch(sortField) {
    case "Profit":
        sortQuery = { profit: sortBy};
        break;
    case "Spent":
        sortQuery = { spent: sortBy};
        break;
    case "Revenue":
        sortQuery = { revenue: sortBy};
        break;
    case "NFTs Bought":
        sortQuery = { nfts_bought: sortBy};
        break;
    case "NFTs Sold":
        sortQuery = { nfts_sold: sortBy};
        break;
    case "Collections Bought":
        sortQuery = { collections_bought: sortBy};
        break;
    case "Collections Sold":
        sortQuery = { collections_sold: sortBy};
        break;
    default:
        sortQuery = { total_profit: sortBy};
        break;
    }
    // console.log(await query.sort(sortQuery).skip(skip).limit(offset).exec());
    // console.log(await query.exec());
    resp.json(await query.sort(sortQuery).skip(skip).limit(offset).exec());
});

export default router;