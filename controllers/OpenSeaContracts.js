import fs from 'fs-extra'
import OpenSeaDeviceInfo from '../Models/OpenSeaDeviceInfo.js';

export const checkDeviceInfo = async() => {
    let device_info = fs.readJsonSync("device_info.json");
    if( device_info.number == 0) {
        let success = false;
        while( !success) {
            const result = await OpenSeaDeviceInfo.find({}).sort({LastDeviceNumber: -1}).limit(1);
            let lastDeviceNumber = 1;
            if( result.length) {
                lastDeviceNumber = result[0].LastDeviceNumber + 1;
            }
            try {
                await OpenSeaDeviceInfo.create({LastDeviceNumber: lastDeviceNumber});
                device_info.number = lastDeviceNumber;
                fs.writeJsonSync("device_info.json", device_info);
                success = true;
            } catch (error) {}
        }
    }
    return device_info.number;
}