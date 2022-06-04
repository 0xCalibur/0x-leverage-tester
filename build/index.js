"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const ethers_1 = require("ethers");
const EACAggregatorProxy_1 = __importDefault(require("./abi/EACAggregatorProxy"));
const UniswapV2Pair_1 = __importDefault(require("./abi/UniswapV2Pair"));
const SwapperTester_1 = __importDefault(require("./abi/SwapperTester"));
const ERC20_1 = __importDefault(require("./abi/ERC20"));
const ZeroXExchangeProxy_1 = __importDefault(require("./abi/ZeroXExchangeProxy"));
function getBigNumber(amount, decimals = 18) {
    return ethers_1.BigNumber.from(amount).mul(ethers_1.BigNumber.from(10).pow(decimals));
}
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    const wallet = ethers_1.Wallet.fromMnemonic(process.env.MNEMONIC || '');
    const mimAmount = getBigNumber(20);
    const provider = new ethers_1.ethers.providers.JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc', 43114);
    const Pair = new ethers_1.Contract('0x4b946c91C2B1a7d7C40FB3C130CdfBaf8389094d', UniswapV2Pair_1.default, provider);
    const MIM = new ethers_1.Contract('0x130966628846BFd36ff31a822705796e8cb8C18D', ERC20_1.default, provider);
    const SwapperTester = new ethers_1.Contract('0x0C963A595AFb4609c5cc6BB0A9daD01925b91886', SwapperTester_1.default, provider);
    const SAvaxChainlink = new ethers_1.Contract('0x2854Ca10a54800e15A2a25cFa52567166434Ff0a', EACAggregatorProxy_1.default, provider);
    const WAvaxChainlink = new ethers_1.Contract('0x0A77230d17318075983913bC2145DB16C7366156', EACAggregatorProxy_1.default, provider);
    const MimChainlink = new ethers_1.Contract('0x54EdAB30a7134A16a54218AE64C73e1DAf48a8Fb', EACAggregatorProxy_1.default, provider);
    const ZeroXExchangeProxy = new ethers_1.Contract('0xdef1c0ded9bec7f1a1670819833240f027b25eff', ZeroXExchangeProxy_1.default, provider);
    const savaxPriceInUsd = yield SAvaxChainlink.latestAnswer(); // 18 decimals
    const wavaxPriceInUsd = yield WAvaxChainlink.latestAnswer(); // 8  decimals
    const mimPriceInUsd = yield MimChainlink.latestAnswer(); // 8  decimals
    const mimValueInUsd = mimAmount.mul(mimPriceInUsd); // 26 decimals
    // Both 18 decimals
    const { _reserve0: sAvaxReserve, _reserve1: wAvaxReserve } = yield Pair.getReserves();
    const totalSupply = yield Pair.totalSupply();
    const sAvaxReserveTotalValueInUsd = sAvaxReserve.mul(savaxPriceInUsd); // 36 decimals
    const wAvaxReserveTotalValueInUsd = wAvaxReserve.mul(wavaxPriceInUsd).mul(ethers_1.BigNumber.from(10).pow(10)); // 26 -> 36 decimals
    const lpTotalValueInUsd = sAvaxReserveTotalValueInUsd.add(wAvaxReserveTotalValueInUsd); // 36 decimals
    const oneLpValueInUsd = lpTotalValueInUsd.div(totalSupply); // 18 decimals
    const lpFractionBuyingPower = mimValueInUsd.mul(ethers_1.BigNumber.from(10).pow(28)).div(lpTotalValueInUsd); // 18 decimals
    const lpAmountBuyingPower = lpFractionBuyingPower.mul(totalSupply).div(ethers_1.BigNumber.from(10).pow(18)); // 18 decimals
    const sAvaxBuyingPower = lpFractionBuyingPower.mul(sAvaxReserve).div(ethers_1.BigNumber.from(10).pow(18)); // 18 decimals
    const wAvaxBuyingPower = lpFractionBuyingPower.mul(wAvaxReserve).div(ethers_1.BigNumber.from(10).pow(18)); // 18 decimals
    console.log(`sAVAX = $${ethers_1.ethers.utils.formatEther(savaxPriceInUsd)}, wAVAX = $${ethers_1.ethers.utils.formatUnits(wavaxPriceInUsd, 8)}`);
    console.log(`Lp total value = $${ethers_1.ethers.utils.formatUnits(lpTotalValueInUsd, 36)}`);
    console.log(`Lp TotalSupply: ${ethers_1.ethers.utils.formatEther(totalSupply)}`);
    console.log(`1 Lp = $${ethers_1.ethers.utils.formatEther(oneLpValueInUsd)}`);
    console.log(`Total MIM value = $${ethers_1.ethers.utils.formatUnits(mimValueInUsd, 26)}`);
    console.log(`Buyable Lp fraction = ${parseFloat(ethers_1.ethers.utils.formatEther(lpFractionBuyingPower)) * 100}%`);
    console.log(`Can buy around ${ethers_1.ethers.utils.formatEther(lpAmountBuyingPower)} Lp`);
    console.log(`Amount of sAVAX to buy: ${ethers_1.ethers.utils.formatEther(sAvaxBuyingPower)}`);
    console.log(`Amount of wAVAX to buy: ${ethers_1.ethers.utils.formatEther(wAvaxBuyingPower)}`);
});
run();
