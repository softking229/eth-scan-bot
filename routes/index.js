import express from 'express'
import { opensea_address, topic_orders_matched } from '../consts.js';
import { fetch_wallet_transactions } from '../controllers/TransactionController.js';
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
    let tx_list = await fetch_wallet_transactions(params, wallet);
    resp.json(tx_list);
});

router.get('/api/profit-leaders', async ( req, resp) => {
    let addFields = {
        "$addFields": {
            "total_profit": {
                "$subtract": [
                    "$revenue", "$spent"
                ]
            },
            "profit": {
                "$cond": [
                    { "$eq": [ "$spent", 0 ] },
                    0,
                    {
                        "$multiply": [
                            {
                                "$divide": [
                                    {
                                        "$subtract": [
                                            "$revenue", "$spent"
                                        ]
                                    }, "$spent"
                                ]
                            },
                            100
                        ]
                    }
                ]
            }
        }
    };
    let sortField = req.query.sortField;
    let sortBy = req.query.sortBy;
    let page = req.query.page;
    let offset = 10;
    let sortQuery;
    page = (page===undefined?1:page*1);
    sortBy = (sortBy=="asc"?1:-1);
    let skip = (page - 1) * offset;
    switch(sortField) {
    case "profit":
        sortQuery = { profit: sortBy};
        break;
    case "spent":
        sortQuery = { spent: sortBy};
        break;
    case "revenue":
        sortQuery = { revenue: sortBy};
        break;
    case "nfts_bought":
        sortQuery = { nfts_bought: sortBy};
        break;
    case "nfts_sold":
        sortQuery = { nfts_sold: sortBy};
        break;
    case "collections_bought":
        sortQuery = { collections_bought: sortBy};
        break;
    case "collections_sold":
        sortQuery = { collections_sold: sortBy};
        break;
    default:
        sortQuery = { total_profit: sortBy};
        break;
    }
    // console.log(await query.sort(sortQuery).skip(skip).limit(offset).exec());
    // console.log(await query.exec());
    console.log(sortField);
    resp.json(await WatchList.aggregate([addFields, { "$sort": sortQuery}, {"$skip": skip}, {"$limit":offset}]));
});

export default router;