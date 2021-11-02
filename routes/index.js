import express from 'express'
import { opensea_address, topic_orders_matched } from '../consts.js';
import { fetch_wallet_transactions } from '../controllers/TransactionController.js';
import WatchList from "../models/WatchList.js";

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
    let page = req.query.page?(1 * req.query.page):1;
    let offset = req.query.limit?(1 * req.query.limit):10;
    let sortQuery;
    sortBy = (sortBy=="asc"?1:-1);
    let skip = (page - 1) * offset;
    let total_count = await WatchList.find().count();
    let total_page;
    total_page = Math.ceil(total_count / offset);
    if( total_page <= 0) total_page = 1;
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
    let response = {
        total_page: total_page,
        page: page,
        limit: offset,
        result: [
            {
                "address": "0x51787a2c56d710c68140bdadefd3a98bff96feb4",
                "spent": 83.682,
                "revenue": 1354.3256373742283,
                "nfts_bought": 42,
                "nfts_sold": 67,
                "mint": 0,
                "total_profit": 1270.6436373742283,
                "profit": 1518.4192985041327,
                "collections_bought": 2,
                "collections_sold": 1,
            }
        ]
    }
    response.result = await WatchList.aggregate([addFields, { "$sort": sortQuery}, {"$skip": skip}, {"$limit":offset}])
    resp.json(response);
});

export default router;