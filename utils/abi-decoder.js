import abiDecoder from 'abi-decoder'
import fs from 'fs-extra'

const abi = fs.readJsonSync("abi.json");
abiDecoder.addABI(abi);

export default abiDecoder;