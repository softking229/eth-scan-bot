import fs from 'fs-extra'
import OpenSeaDeviceInfo from '../models/OpenSeaDeviceInfo.js';
export const getTotalDevices = async() => {
    const result = await OpenSeaDeviceInfo.find({}).sort({LastDeviceNumber: -1}).limit(1);
    if( !result.length)
        return 0;
    return result[0].LastDeviceNumber;
}

export const checkDeviceInfo = async() => {
    let device_info = fs.readJsonSync("device_info.json");
    console.log("My Device Number is ", device_info.number);
    let success = false;
    while( !success) {
        const result = await OpenSeaDeviceInfo.find({}).sort({LastDeviceNumber: -1}).limit(1);
        let lastDeviceNumber = 1;
        if( result.length) {
            lastDeviceNumber = result[0].LastDeviceNumber + 1;
        }
        if( device_info.number != 0 && device_info.number < lastDeviceNumber) {
            success = true;
            continue;
        }
        try {
            await OpenSeaDeviceInfo.create({LastDeviceNumber: lastDeviceNumber});
            device_info.number = lastDeviceNumber;
            fs.writeJsonSync("device_info.json", device_info);
            success = true;
            console.log("Now Device Number is ", device_info.number);
        } catch (error) {}
    }
    return device_info.number;
}