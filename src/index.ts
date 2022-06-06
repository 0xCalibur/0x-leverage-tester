import 'dotenv/config';
import { BigNumber, Contract, ethers, Wallet } from 'ethers';
import EACAggregatorProxyAbi from './abi/EACAggregatorProxy';
import UniswapV2PairAbi from './abi/UniswapV2Pair';
import SwapperTesterAbi from './abi/SwapperTester';
import ERC20Abi from './abi/ERC20';
import ZeroXExchangeProxyAbi from './abi/ZeroXExchangeProxy';
import DegenBoxAbi from './abi/DegenBox';
import fetch from 'node-fetch';

let provider = new ethers.providers.JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc', 43114);
let wallet = Wallet.fromMnemonic(process.env.MNEMONIC || '').connect(provider);
let Limone: Contract;
let Pair: Contract;
let MIM: Contract;
let SwapperTester: Contract;
let SAvaxChainlink: Contract;
let WAvaxChainlink: Contract;
let MimChainlink: Contract;
let sAvax: Contract;
let wAvax: Contract;
let savaxPriceInUsd: BigNumber;
let wavaxPriceInUsd: BigNumber;
let mimPriceInUsd: BigNumber;
let sAvaxReserve: BigNumber;
let wAvaxReserve: BigNumber;
let totalSupply: BigNumber;

interface ZeroExResponse {
  data: string;
  buyAmount: BigNumber;
  sellAmount: BigNumber;
  estimatedGas: BigNumber;
}

const getBigNumber = (amount: any, decimals = 18) => {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
};

const query0x = async (
  sellToken: string,
  buyToken: string,
  slippage: number,
  sellAmount: BigNumber
): Promise<ZeroExResponse> => {
  let query;

  query = `https://avalanche.api.0x.org/swap/v1/quote?buyToken=${buyToken}&sellToken=${sellToken}&sellAmount=${sellAmount.toString()}&slippagePercentage=${slippage}`;

  console.log(query);

  const response = await fetch(query);
  const json = (await response.json()) as any;

  return {
    data: json.data,
    buyAmount: BigNumber.from(json.buyAmount),
    sellAmount: BigNumber.from(json.sellAmount),
    estimatedGas: BigNumber.from(json.estimatedGas),
  };
};

// extracted from UniswapV2Pair mint function
const getMintedAmount = (
  amount0: BigNumber,
  amount1: BigNumber,
  reserve0: BigNumber,
  reserve1: BigNumber,
  totalSupply: BigNumber
) => {
  const liquidity0 = amount0.mul(totalSupply).div(reserve0);
  const liquidity1 = amount1.mul(totalSupply).div(reserve1);

  if (liquidity0.lte(liquidity1)) {
    return liquidity0;
  }

  return liquidity1;
};

const initialize = async () => {
  Limone = new Contract('0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4', DegenBoxAbi, provider);
  Pair = new Contract('0x4b946c91C2B1a7d7C40FB3C130CdfBaf8389094d', UniswapV2PairAbi, provider);
  MIM = new Contract('0x130966628846BFd36ff31a822705796e8cb8C18D', ERC20Abi, provider);
  SwapperTester = new Contract('0x0C963A595AFb4609c5cc6BB0A9daD01925b91886', SwapperTesterAbi, provider);
  SAvaxChainlink = new Contract('0x2854Ca10a54800e15A2a25cFa52567166434Ff0a', EACAggregatorProxyAbi, provider);
  WAvaxChainlink = new Contract('0x0A77230d17318075983913bC2145DB16C7366156', EACAggregatorProxyAbi, provider);
  MimChainlink = new Contract('0x54EdAB30a7134A16a54218AE64C73e1DAf48a8Fb', EACAggregatorProxyAbi, provider);
  sAvax = new Contract(await Pair.token0(), ERC20Abi, provider);
  wAvax = new Contract(await Pair.token1(), ERC20Abi, provider);

  savaxPriceInUsd = await SAvaxChainlink.latestAnswer(); // 18 decimals
  wavaxPriceInUsd = await WAvaxChainlink.latestAnswer(); // 8  decimals
  mimPriceInUsd = await MimChainlink.latestAnswer(); // 8  decimals

  ({ _reserve0: sAvaxReserve, _reserve1: wAvaxReserve } = await Pair.getReserves());
  totalSupply = await Pair.totalSupply();
};

const testLeverage = async (mimAmount: BigNumber) => {
  console.log('=== Leveraging ===');
  const mimValueInUsd = mimAmount.mul(mimPriceInUsd); // 26 decimals

  // Both 18 decimals
  const sAvaxReserveTotalValueInUsd = sAvaxReserve.mul(savaxPriceInUsd); // 36 decimals
  const wAvaxReserveTotalValueInUsd = wAvaxReserve.mul(wavaxPriceInUsd).mul(BigNumber.from(10).pow(10)); // 26 -> 36 decimals
  const lpTotalValueInUsd = sAvaxReserveTotalValueInUsd.add(wAvaxReserveTotalValueInUsd); // 36 decimals
  const oneLpValueInUsd = lpTotalValueInUsd.div(totalSupply); // 18 decimals
  const lpFractionBuyingPower = mimValueInUsd.mul(BigNumber.from(10).pow(28)).div(lpTotalValueInUsd); // 18 decimals
  const lpAmountBuyingPower = lpFractionBuyingPower.mul(totalSupply).div(BigNumber.from(10).pow(18)); // 18 decimals
  const sAvaxBuyingPower = lpFractionBuyingPower.mul(sAvaxReserve).div(BigNumber.from(10).pow(18)); // 18 decimals
  const wAvaxBuyingPower = lpFractionBuyingPower.mul(wAvaxReserve).div(BigNumber.from(10).pow(18)); // 18 decimals

  // Query 0x to get how much MIM you get from swapping sAVAX and wAVAX. No slipage is used
  // so that we get the quote only.
  // sell sAvaxBuyingPower => buy MIM
  const queryMimAmountFromSavax = await query0x(sAvax.address, MIM.address, 0, sAvaxBuyingPower);
  //sell  wAvaxBuyingPower => buy MIM
  const queryMimAmountFromWavax = await query0x(wAvax.address, MIM.address, 0, wAvaxBuyingPower);

  // Now calculate how much % of the initial mim the returned mim value consist of
  // This extra step is just to make sure the total input amount of mim doesn't exceed
  // the `mimAmount`
  const mimAmountToSwapForSavax = queryMimAmountFromSavax.buyAmount.mul(mimAmount).div(mimAmount);
  const mimAmountToSwapForWavax = queryMimAmountFromWavax.buyAmount.mul(mimAmount).div(mimAmount);

  const slippage = 0.01; // 1% slippage
  // sell MIM => buy sAvaxBuyingPower
  const querySavaxAmountFromMim = await query0x(MIM.address, sAvax.address, slippage, mimAmountToSwapForSavax);
  // sell MIM => buy wAvaxBuyingPower
  const queryWavaxAmountFromMim = await query0x(MIM.address, wAvax.address, slippage, mimAmountToSwapForWavax);

  const totalMimAmountToSwap = querySavaxAmountFromMim.sellAmount.add(queryWavaxAmountFromMim.sellAmount);

  console.log(`Total MIM amount to swap: ${ethers.utils.formatEther(queryMimAmountFromSavax.buyAmount)}`);
  if (totalMimAmountToSwap.gt(mimAmount)) {
    throw new Error(`total mim amount to swap ${totalMimAmountToSwap.toString()} exceed ${mimAmount.toString()}`);
  }

  const lpAmount = getMintedAmount(
    querySavaxAmountFromMim.buyAmount,
    queryWavaxAmountFromMim.buyAmount,
    sAvaxReserve,
    wAvaxReserve,
    totalSupply
  );

  const shareToMin = await Limone.toShare(Pair.address, lpAmount, false);
  // If some savax or wavax remains after the add liquidity, the minimum amount of
  // it considered to swap again for more lp using one-side technic.
  const minimumSavaxToSwapAgainForMoreLp = getBigNumber(1, 16);
  const minimumWavaxToSwapAgainForMoreLp = getBigNumber(1, 16);

  const data = ethers.utils.defaultAbiCoder.encode(
    ['bytes[]', 'uint256', 'uint256'],
    [
      [querySavaxAmountFromMim.data, queryWavaxAmountFromMim.data],
      minimumSavaxToSwapAgainForMoreLp,
      minimumWavaxToSwapAgainForMoreLp,
    ]
  );

  console.log(
    `sAVAX = $${ethers.utils.formatEther(savaxPriceInUsd)}, wAVAX = $${ethers.utils.formatUnits(wavaxPriceInUsd, 8)}`
  );
  console.log(
    `Expecting ${ethers.utils.formatEther(queryMimAmountFromSavax.buyAmount)} MIM from ${ethers.utils.formatEther(
      sAvaxBuyingPower
    )} sAVAX`
  );
  console.log(
    `Expecting ${ethers.utils.formatEther(queryMimAmountFromWavax.buyAmount)} MIM from ${ethers.utils.formatEther(
      wAvaxBuyingPower
    )} sAVAX`
  );
  console.log(
    `Expecting ${ethers.utils.formatEther(querySavaxAmountFromMim.buyAmount)} sAVAX from ${ethers.utils.formatEther(
      mimAmountToSwapForSavax
    )} MIM`
  );
  console.log(
    `Expecting ${ethers.utils.formatEther(queryWavaxAmountFromMim.buyAmount)} wAVAX from ${ethers.utils.formatEther(
      mimAmountToSwapForWavax
    )} MIM`
  );
  console.log(`lpAmount: ${ethers.utils.formatEther(lpAmount)}, shareToMin: ${ethers.utils.formatEther(shareToMin)}`);
  console.log(`Lp total value = $${ethers.utils.formatUnits(lpTotalValueInUsd, 36)}`);
  console.log(`Lp TotalSupply: ${ethers.utils.formatEther(totalSupply)}`);
  console.log(`1 Lp = $${ethers.utils.formatEther(oneLpValueInUsd)}`);
  console.log(`Total MIM value = $${ethers.utils.formatUnits(mimValueInUsd, 26)}`);
  console.log(`Buyable Lp fraction = ${parseFloat(ethers.utils.formatEther(lpFractionBuyingPower)) * 100}%`);
  console.log(`Can buy around ${ethers.utils.formatEther(lpAmountBuyingPower)} Lp`);
  console.log(`Amount of sAVAX to buy: ${ethers.utils.formatEther(sAvaxBuyingPower)}`);
  console.log(`Amount of wAVAX to buy: ${ethers.utils.formatEther(wAvaxBuyingPower)}`);

  const lpBefore = await Pair.balanceOf(wallet.address);
  const tx = await SwapperTester.connect(wallet).testLeveraging(
    Limone.address,
    '0xEf05d8747a6Fc81509fb37EcF6b1a2D39290d881', // ZeroXUniswapLikeLPLevSwapper
    Pair.address,
    mimAmount,
    shareToMin,
    data,
    {
      gasLimit: querySavaxAmountFromMim.estimatedGas
        .add(queryWavaxAmountFromMim.estimatedGas)
        .add(BigNumber.from(500_000)) // add extra gas (should be estimated instead)
        .toString(),
    }
  );
  console.log('Sending transaction...');
  await tx.wait();
  console.log(`https://snowtrace.io/tx/${tx.hash}`);

  const lpAfter = await Pair.balanceOf(wallet.address);

  return lpAfter.sub(lpBefore);
};

const testLiquidation = async (lpAmount: BigNumber) => {
  console.log('=== Liquidation ===');

  const lpAmountToken0 = await sAvax.balanceOf(Pair.address);
  const lpAmountToken1 = await wAvax.balanceOf(Pair.address);
  const amount0 = lpAmount.mul(lpAmountToken0).div(totalSupply);
  const amount1 = lpAmount.mul(lpAmountToken1).div(totalSupply);

  const slippage = 0.01; // 1% slippage
  const querySavaxToMim = await query0x(sAvax.address, MIM.address, slippage, amount0);
  const queryWavaxToMim = await query0x(wAvax.address, MIM.address, slippage, amount1);
  let totalMimBuyAmount = querySavaxToMim.buyAmount.add(queryWavaxToMim.buyAmount);
  totalMimBuyAmount = totalMimBuyAmount.sub(totalMimBuyAmount.div(100)); // add 1% sippage

  const shareToMin = await Limone.toShare(MIM.address, totalMimBuyAmount, false);
  const data = ethers.utils.defaultAbiCoder.encode(['bytes[]'], [[querySavaxToMim.data, queryWavaxToMim.data]]);

  console.log(`lpAmount to liquidate: ${ethers.utils.formatEther(lpAmount)}`);
  console.log(`sAvax amount: ${ethers.utils.formatEther(amount0)}`);
  console.log(`wAvax amount: ${ethers.utils.formatEther(amount1)}`);
  console.log(`MIM to buy from LP tokens: ${ethers.utils.formatEther(totalMimBuyAmount)}`);
  console.log(`Expected mimAmount min share: ${ethers.utils.formatEther(shareToMin)}`);

  const tx = await SwapperTester.connect(wallet).testLiquidation(
    Limone.address,
    '0x1B77fDaBAa7FefD55f4aC075B6E817b8d773315b', // ZeroXUniswapLikeLPSwapper
    Pair.address,
    lpAmount,
    shareToMin,
    data,
    {
      gasLimit: querySavaxToMim.estimatedGas
        .add(queryWavaxToMim.estimatedGas)
        .add(BigNumber.from(500_000)) // add extra gas (should be estimated instead)
        .toString(),
    }
  );
  console.log('Sending transaction...');
  await tx.wait();
  console.log(`https://snowtrace.io/tx/${tx.hash}`);
};

const run = async () => {
  await initialize();
  const mimAmount = getBigNumber(20);
  const lpAmount = await testLeverage(mimAmount);
  await testLiquidation(lpAmount);
};

run();
