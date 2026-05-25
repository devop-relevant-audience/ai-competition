import { adjustConfidence } from './GameState.js';
import { RESOURCE_IDS } from '../data/resources.js';
import { TERRITORY_DATA } from '../data/territories.js';

const BASE_PRICES = { oil: 4, uranium: 6, rare_earths: 5, titanium: 5 };
const MIN_PRICE = 1;
const MAX_PRICE = 20;
const VOLATILITY = 1.5;
const BUBBLE_THRESHOLD = 4;
const BUBBLE_POP_CHANCE = 0.3;

export class MarketEngine {
  processMarketBans(state) {
    if (!state.market) return;
    state.market.bans = state.market.bans.filter(b => b.expiresOnTurn > state.meta.turn);
  }

  processLimitOrders(state) {
    if (!state.market) return;
    const events = [];
    const executed = [];

    for (let i = state.market.pendingOrders.length - 1; i >= 0; i--) {
      const order = state.market.pendingOrders[i];
      const price = state.market.prices[order.resource]?.current;
      if (!price) continue;

      let shouldExecute = false;
      if (order.orderType === 'limit_buy' && price <= order.triggerPrice) shouldExecute = true;
      if (order.orderType === 'limit_sell' && price >= order.triggerPrice) shouldExecute = true;

      if (shouldExecute) {
        const empire = state.empires[order.empireId];
        if (!empire || empire.isEliminated) { executed.push(i); continue; }
        if (this._isEmpireBanned(state, order.empireId)) { executed.push(i); continue; }

        if (order.orderType === 'limit_buy') {
          const cost = order.amount * price;
          if (empire.treasury >= cost) {
            empire.treasury -= cost;
            empire.resources[order.resource].stockpile += order.amount;
            state.market.turnActivity.push({
              type: 'limit_buy_executed', empireId: order.empireId,
              resource: order.resource, amount: order.amount, price,
            });
            events.push({
              turn: state.meta.turn, type: 'market_buy',
              description: `${empire.name} limit order executed: bought ${order.amount} ${order.resource} at ${price}c`,
              involvedEmpires: [order.empireId],
            });
          }
        } else {
          const stock = empire.resources[order.resource].stockpile;
          const sellAmount = Math.min(order.amount, stock);
          if (sellAmount > 0) {
            empire.resources[order.resource].stockpile -= sellAmount;
            empire.treasury += sellAmount * price;
            state.market.turnActivity.push({
              type: 'limit_sell_executed', empireId: order.empireId,
              resource: order.resource, amount: sellAmount, price,
            });
            events.push({
              turn: state.meta.turn, type: 'market_sell',
              description: `${empire.name} limit order executed: sold ${sellAmount} ${order.resource} at ${price}c`,
              involvedEmpires: [order.empireId],
            });
          }
        }
        executed.push(i);
      }
    }

    for (const idx of executed.sort((a, b) => b - a)) {
      state.market.pendingOrders.splice(idx, 1);
    }

    return events;
  }

  processMarketActions(state, marketActions) {
    if (!state.market) return [];
    const events = [];
    state.market.turnActivity = [];

    this._turnVolume = {};
    for (const rid of RESOURCE_IDS) this._turnVolume[rid] = { bought: 0, sold: 0 };

    for (const [empireId, actions] of Object.entries(marketActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        if (this._isEmpireBanned(state, empireId)) {
          events.push({
            turn: state.meta.turn, type: 'market_action_blocked',
            description: `${empire.name}'s market action was blocked — banned from the exchange!`,
            involvedEmpires: [empireId],
          });
          continue;
        }

        switch (action.type) {
          case 'market_buy':
            events.push(...this._processBuy(state, empireId, action));
            break;
          case 'market_sell':
            events.push(...this._processSell(state, empireId, action));
            break;
          case 'market_limit_buy':
            events.push(...this._processLimitBuy(state, empireId, action));
            break;
          case 'market_limit_sell':
            events.push(...this._processLimitSell(state, empireId, action));
            break;
          case 'market_dump':
            events.push(...this._processDump(state, empireId, action));
            break;
          case 'market_corner':
            events.push(...this._processCorner(state, empireId, action));
            break;
          case 'market_ban':
            events.push(...this._processMarketBan(state, empireId, action));
            break;
        }
      }
    }

    return events;
  }

  updateMarketPrices(state) {
    if (!state.market) return [];
    const events = [];
    const turn = state.meta.turn;

    for (const rid of RESOURCE_IDS) {
      const priceData = state.market.prices[rid];
      const oldPrice = priceData.current;

      const globalProduction = this._countGlobalProduction(state, rid);
      const baselineProduction = 3;
      const supplyRatio = globalProduction / baselineProduction;

      const vol = this._turnVolume?.[rid] || { bought: 0, sold: 0 };
      const netDemand = vol.bought - vol.sold;
      const demandRatio = (netDemand + 2) / 2;

      const noise = (Math.random() - 0.5);
      const priceDelta = (demandRatio - supplyRatio) * VOLATILITY + noise;
      const newPrice = Math.round(Math.max(MIN_PRICE, Math.min(MAX_PRICE, oldPrice + priceDelta)) * 10) / 10;

      priceData.current = newPrice;
      const totalVolume = vol.bought + vol.sold;
      priceData.history.push({ turn, price: newPrice, volume: totalVolume });

      if (priceData.history.length > 50) {
        priceData.history = priceData.history.slice(-50);
      }

      const changePercent = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

      if (changePercent < -30) {
        events.push({
          turn, type: 'market_crash',
          description: `Global ${rid} prices crashed ${Math.abs(Math.round(changePercent))}%!`,
          involvedEmpires: [],
        });
      } else if (changePercent > 30) {
        events.push({
          turn, type: 'market_boom',
          description: `${rid.replace('_', ' ')} prices surged ${Math.round(changePercent)}%!`,
          involvedEmpires: [],
        });
      }

      // Bubble tracking
      if (vol.bought >= BUBBLE_THRESHOLD) {
        state.market.bubbles[rid]++;
      } else {
        state.market.bubbles[rid] = 0;
      }

      if (state.market.bubbles[rid] >= 3) {
        if (Math.random() < BUBBLE_POP_CHANCE) {
          priceData.current = Math.max(MIN_PRICE, Math.round(priceData.current * 0.5 * 10) / 10);
          state.market.bubbles[rid] = 0;
          events.push({
            turn, type: 'bubble_pop',
            description: `The ${rid.replace('_', ' ')} bubble has BURST! Prices crashed 50% — speculators in ruin!`,
            involvedEmpires: [],
          });
          for (const empire of Object.values(state.empires)) {
            if (empire.isEliminated) continue;
            if (empire.resources[rid]?.stockpile >= 3) {
              adjustConfidence(empire, -2);
            }
          }
        }
      }

      // Monopoly check
      const monopolist = this._checkMonopoly(state, rid);
      if (monopolist) {
        events.push({
          turn, type: 'monopoly_warning',
          description: `${state.empires[monopolist].name} controls >60% of global ${rid.replace('_', ' ')} production — market monopoly risk!`,
          involvedEmpires: [monopolist],
        });
        adjustConfidence(state.empires[monopolist], 5);
      }
    }

    return events;
  }

  _processBuy(state, empireId, action) {
    const empire = state.empires[empireId];
    const { resource, amount } = action;
    const price = state.market.prices[resource].current;
    const cost = amount * price;

    if (empire.treasury < cost) return [];
    empire.treasury -= cost;
    empire.resources[resource].stockpile += amount;
    this._turnVolume[resource].bought += amount;

    state.market.turnActivity.push({ type: 'buy', empireId, resource, amount, price });
    return [{
      turn: state.meta.turn, type: 'market_buy',
      description: `${empire.name} bought ${amount} ${resource} at ${price}c each`,
      involvedEmpires: [empireId],
    }];
  }

  _processSell(state, empireId, action) {
    const empire = state.empires[empireId];
    const { resource, amount } = action;
    const stock = empire.resources[resource].stockpile;
    const sellAmount = Math.min(amount, stock);
    if (sellAmount <= 0) return [];

    const price = state.market.prices[resource].current;
    empire.resources[resource].stockpile -= sellAmount;
    empire.treasury += sellAmount * price;
    this._turnVolume[resource].sold += sellAmount;

    state.market.turnActivity.push({ type: 'sell', empireId, resource, amount: sellAmount, price });
    return [{
      turn: state.meta.turn, type: 'market_sell',
      description: `${empire.name} sold ${sellAmount} ${resource} at ${price}c each`,
      involvedEmpires: [empireId],
    }];
  }

  _processLimitBuy(state, empireId, action) {
    state.market.pendingOrders.push({
      empireId, resource: action.resource, amount: action.amount,
      triggerPrice: action.max_price, orderType: 'limit_buy',
    });
    return [{
      turn: state.meta.turn, type: 'market_buy',
      description: `${state.empires[empireId].name} placed a limit buy order for ${action.amount} ${action.resource} at max ${action.max_price}c`,
      involvedEmpires: [empireId],
    }];
  }

  _processLimitSell(state, empireId, action) {
    state.market.pendingOrders.push({
      empireId, resource: action.resource, amount: action.amount,
      triggerPrice: action.min_price, orderType: 'limit_sell',
    });
    return [{
      turn: state.meta.turn, type: 'market_sell',
      description: `${state.empires[empireId].name} placed a limit sell order for ${action.amount} ${action.resource} at min ${action.min_price}c`,
      involvedEmpires: [empireId],
    }];
  }

  _processDump(state, empireId, action) {
    const empire = state.empires[empireId];
    const { resource, amount } = action;
    const stock = empire.resources[resource].stockpile;
    const dumpAmount = Math.min(amount, stock, 5);
    if (dumpAmount <= 0) return [];

    const price = state.market.prices[resource].current;
    const sellPrice = Math.round(price * 0.75 * 10) / 10;
    empire.resources[resource].stockpile -= dumpAmount;
    empire.treasury += dumpAmount * sellPrice;
    this._turnVolume[resource].sold += dumpAmount;

    // Crash the price immediately
    state.market.prices[resource].current = Math.max(MIN_PRICE, Math.round((price * 0.7) * 10) / 10);

    // Confidence hit to holders
    for (const e of Object.values(state.empires)) {
      if (e.isEliminated || e.id === empireId) continue;
      if (e.resources[resource]?.stockpile >= 3) {
        adjustConfidence(e, -1);
      }
    }

    state.market.turnActivity.push({ type: 'dump', empireId, resource, amount: dumpAmount, price: sellPrice });
    return [{
      turn: state.meta.turn, type: 'market_dump',
      description: `${empire.name} DUMPED ${dumpAmount} ${resource} at discount, crashing the price!`,
      involvedEmpires: [empireId],
    }];
  }

  _processCorner(state, empireId, action) {
    const empire = state.empires[empireId];
    const { resource, amount } = action;
    const price = state.market.prices[resource].current;
    const buyPrice = Math.round(price * 1.25 * 10) / 10;
    const cost = amount * buyPrice;
    const buyAmount = Math.min(amount, 5);

    if (empire.treasury < buyAmount * buyPrice) return [];
    empire.treasury -= buyAmount * buyPrice;
    empire.resources[resource].stockpile += buyAmount;
    this._turnVolume[resource].bought += buyAmount;

    // Spike the price
    state.market.prices[resource].current = Math.min(MAX_PRICE, Math.round((price * 1.3) * 10) / 10);
    adjustConfidence(empire, 3);

    state.market.turnActivity.push({ type: 'corner', empireId, resource, amount: buyAmount, price: buyPrice });
    return [{
      turn: state.meta.turn, type: 'market_corner',
      description: `${empire.name} CORNERED the ${resource} market, buying ${buyAmount} at premium and spiking prices!`,
      involvedEmpires: [empireId],
    }];
  }

  _processMarketBan(state, empireId, action) {
    const targetId = action.target_empire_id;
    const target = state.empires[targetId];
    if (!target || target.isEliminated) return [];

    state.market.bans.push({
      targetEmpireId: targetId,
      imposedByEmpireId: empireId,
      expiresOnTurn: state.meta.turn + 2,
    });

    adjustConfidence(target, -2);

    state.market.turnActivity.push({ type: 'ban', empireId, targetId });
    return [{
      turn: state.meta.turn, type: 'market_ban_imposed',
      description: `${state.empires[empireId].name} has banned ${target.name} from the Commodities Exchange for 2 turns!`,
      involvedEmpires: [empireId, targetId],
    }];
  }

  _isEmpireBanned(state, empireId) {
    return state.market.bans.some(b => b.targetEmpireId === empireId && b.expiresOnTurn > state.meta.turn);
  }

  _countGlobalProduction(state, resource) {
    let count = 0;
    for (const [tid, terr] of Object.entries(state.territories)) {
      if (terr.ownerId && TERRITORY_DATA[tid]?.rareResource === resource) {
        count++;
      }
    }
    return count || 1;
  }

  _checkMonopoly(state, resource) {
    const total = this._countGlobalProduction(state, resource);
    const perEmpire = {};
    for (const [tid, terr] of Object.entries(state.territories)) {
      if (terr.ownerId && TERRITORY_DATA[tid]?.rareResource === resource) {
        perEmpire[terr.ownerId] = (perEmpire[terr.ownerId] || 0) + 1;
      }
    }
    for (const [eid, count] of Object.entries(perEmpire)) {
      if (count / total > 0.6) return eid;
    }
    return null;
  }
}
