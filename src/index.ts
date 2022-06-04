import 'dotenv/config';
import { BigNumber, Contract, ethers, utils, Wallet } from 'ethers';
import EACAggregatorProxyAbi from './abi/EACAggregatorProxy';
import UniswapV2PairAbi from './abi/UniswapV2Pair';
import SwapperTesterAbi from './abi/SwapperTester';
import ERC20Abi from './abi/ERC20';
import ZeroXExchangeProxyAbi from './abi/ZeroXExchangeProxy';

function getBigNumber(amount: any, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
}

const run = async () => {
  const wallet = Wallet.fromMnemonic(process.env.MNEMONIC || '');
  const mimAmount = getBigNumber(20);

  const provider = new ethers.providers.JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc', 43114);

  const Pair = new Contract('0x4b946c91C2B1a7d7C40FB3C130CdfBaf8389094d', UniswapV2PairAbi, provider);
  const MIM = new Contract('0x130966628846BFd36ff31a822705796e8cb8C18D', ERC20Abi, provider);
  const SwapperTester = new Contract('0x0C963A595AFb4609c5cc6BB0A9daD01925b91886', SwapperTesterAbi, provider);
  const SAvaxChainlink = new Contract('0x2854Ca10a54800e15A2a25cFa52567166434Ff0a', EACAggregatorProxyAbi, provider);
  const WAvaxChainlink = new Contract('0x0A77230d17318075983913bC2145DB16C7366156', EACAggregatorProxyAbi, provider);
  const MimChainlink = new Contract('0x54EdAB30a7134A16a54218AE64C73e1DAf48a8Fb', EACAggregatorProxyAbi, provider);

  const ZeroXExchangeProxy = new Contract(
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    ZeroXExchangeProxyAbi,
    provider
  );

  const savaxPriceInUsd = await SAvaxChainlink.latestAnswer(); // 18 decimals
  const wavaxPriceInUsd = await WAvaxChainlink.latestAnswer(); // 8  decimals
  const mimPriceInUsd = await MimChainlink.latestAnswer(); // 8  decimals
  const mimValueInUsd = mimAmount.mul(mimPriceInUsd); // 26 decimals

  // Both 18 decimals
  const { _reserve0: sAvaxReserve, _reserve1: wAvaxReserve } = await Pair.getReserves();
  const totalSupply = await Pair.totalSupply();
  const sAvaxReserveTotalValueInUsd = sAvaxReserve.mul(savaxPriceInUsd); // 36 decimals
  const wAvaxReserveTotalValueInUsd = wAvaxReserve.mul(wavaxPriceInUsd).mul(BigNumber.from(10).pow(10)); // 26 -> 36 decimals
  const lpTotalValueInUsd = sAvaxReserveTotalValueInUsd.add(wAvaxReserveTotalValueInUsd); // 36 decimals
  const oneLpValueInUsd = lpTotalValueInUsd.div(totalSupply); // 18 decimals
  const lpFractionBuyingPower = mimValueInUsd.mul(BigNumber.from(10).pow(28)).div(lpTotalValueInUsd); // 18 decimals
  const lpAmountBuyingPower = lpFractionBuyingPower.mul(totalSupply).div(BigNumber.from(10).pow(18)); // 18 decimals
  const sAvaxBuyingPower = lpFractionBuyingPower.mul(sAvaxReserve).div(BigNumber.from(10).pow(18)); // 18 decimals
  const wAvaxBuyingPower = lpFractionBuyingPower.mul(wAvaxReserve).div(BigNumber.from(10).pow(18)); // 18 decimals

  console.log(
    `sAVAX = $${ethers.utils.formatEther(savaxPriceInUsd)}, wAVAX = $${ethers.utils.formatUnits(wavaxPriceInUsd, 8)}`
  );
  console.log(`Lp total value = $${ethers.utils.formatUnits(lpTotalValueInUsd, 36)}`);
  console.log(`Lp TotalSupply: ${ethers.utils.formatEther(totalSupply)}`);
  console.log(`1 Lp = $${ethers.utils.formatEther(oneLpValueInUsd)}`);
  console.log(`Total MIM value = $${ethers.utils.formatUnits(mimValueInUsd, 26)}`);
  console.log(`Buyable Lp fraction = ${parseFloat(ethers.utils.formatEther(lpFractionBuyingPower)) * 100}%`);
  console.log(`Can buy around ${ethers.utils.formatEther(lpAmountBuyingPower)} Lp`);
  console.log(`Amount of sAVAX to buy: ${ethers.utils.formatEther(sAvaxBuyingPower)}`);
  console.log(`Amount of wAVAX to buy: ${ethers.utils.formatEther(wAvaxBuyingPower)}`);
};

run();
