export class BountyEngine {
  processPlaceBounty(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        const targetId = action.target_empire_id;
        const target = state.empires[targetId];
        if (!target || target.isEliminated || targetId === empireId) continue;

        const amount = Math.min(action.amount || 0, empire.treasury, 100);
        if (amount <= 0) continue;

        empire.treasury -= amount;

        const bountyId = `bounty_${empireId}_${targetId}_${state.meta.turn}`;
        if (!state.bounties) state.bounties = [];
        state.bounties.push({
          id: bountyId,
          placedBy: empireId,
          targetEmpireId: targetId,
          amount,
          placedTurn: state.meta.turn,
          expiresTurn: state.meta.turn + 10,
        });

        events.push({
          turn: state.meta.turn,
          type: 'bounty_placed',
          description: `${empire.name} placed a ${amount} capital bounty on ${target.name}!`,
          involvedEmpires: [empireId, targetId],
        });
      }
    }

    return events;
  }

  checkBountyPayouts(state, captureEvents) {
    const events = [];
    if (!state.bounties || state.bounties.length === 0) return events;

    const captures = captureEvents.filter(e => e.type === 'territory_captured');

    for (const capture of captures) {
      const capturerIds = capture.involvedEmpires;
      if (!capturerIds || capturerIds.length === 0) continue;

      const capturerId = capturerIds[0];
      const loserIds = capture.involvedEmpires.slice(1);

      for (const loserId of loserIds) {
        const matchingBounties = state.bounties.filter(b =>
          b.targetEmpireId === loserId && b.amount > 0
        );

        for (const bounty of matchingBounties) {
          if (bounty.placedBy === capturerId) continue;
          const payout = Math.ceil(bounty.amount / 3);
          const actualPayout = Math.min(payout, bounty.amount);
          bounty.amount -= actualPayout;

          const capturerEmpire = state.empires[capturerId];
          if (capturerEmpire) {
            capturerEmpire.treasury += actualPayout;
          }

          const placerName = state.empires[bounty.placedBy]?.name || bounty.placedBy;
          const targetName = state.empires[loserId]?.name || loserId;

          events.push({
            turn: state.meta.turn,
            type: 'bounty_collected',
            description: `${capturerEmpire?.name || capturerId} collected ${actualPayout} capital from ${placerName}'s bounty on ${targetName}!`,
            involvedEmpires: [capturerId, bounty.placedBy, loserId],
          });
        }
      }
    }

    state.bounties = state.bounties.filter(b => b.amount > 0);
    return events;
  }

  expireBounties(state) {
    const events = [];
    if (!state.bounties) return events;

    const expired = state.bounties.filter(b => state.meta.turn > b.expiresTurn);

    for (const bounty of expired) {
      const placer = state.empires[bounty.placedBy];
      if (placer && !placer.isEliminated) {
        placer.treasury += bounty.amount;
      }

      const targetName = state.empires[bounty.targetEmpireId]?.name || bounty.targetEmpireId;
      events.push({
        turn: state.meta.turn,
        type: 'bounty_expired',
        description: `Bounty on ${targetName} expired. ${bounty.amount} capital refunded to ${placer?.name || bounty.placedBy}.`,
        involvedEmpires: [bounty.placedBy, bounty.targetEmpireId],
      });
    }

    state.bounties = state.bounties.filter(b => state.meta.turn <= b.expiresTurn);
    return events;
  }
}
