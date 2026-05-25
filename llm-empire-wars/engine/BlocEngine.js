import { getRelationKey } from './GameState.js';

const FORM_BLOC_COST = 5;

export class BlocEngine {
  processFormBloc(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        if (action.type !== 'form_bloc') continue;

        if (!state.blocs) state.blocs = {};

        const alreadyInBloc = Object.values(state.blocs).some(
          b => b.members.includes(empireId)
        );
        if (alreadyInBloc) continue;

        const inviteId = action.invite_empire_id;
        const invitee = state.empires[inviteId];
        if (!invitee || invitee.isEliminated) continue;

        const inviteeInBloc = Object.values(state.blocs).some(
          b => b.members.includes(inviteId)
        );
        if (inviteeInBloc) continue;

        const key = getRelationKey(empireId, inviteId);
        const rel = state.relations[key];
        if (!rel || rel.status !== 'alliance') continue;

        if (empire.treasury < FORM_BLOC_COST) continue;

        empire.treasury -= FORM_BLOC_COST;

        const blocId = `bloc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        state.blocs[blocId] = {
          id: blocId,
          name: action.bloc_name,
          founderId: empireId,
          members: [empireId, inviteId],
          createdTurn: state.meta.turn,
        };

        events.push({
          turn: state.meta.turn,
          type: 'bloc_formed',
          description: `${empire.name} and ${invitee.name} formed the "${action.bloc_name}" coalition!`,
          involvedEmpires: [empireId, inviteId],
        });
      }
    }

    return events;
  }

  processInviteBloc(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        if (action.type !== 'invite_bloc') continue;

        if (!state.blocs) continue;

        const myBloc = Object.values(state.blocs).find(
          b => b.members.includes(empireId)
        );
        if (!myBloc) continue;

        const targetId = action.target_empire_id;
        const target = state.empires[targetId];
        if (!target || target.isEliminated) continue;

        const targetInBloc = Object.values(state.blocs).some(
          b => b.members.includes(targetId)
        );
        if (targetInBloc) continue;

        const alliedWithAll = myBloc.members.every(memberId => {
          if (memberId === targetId) return true;
          const key = getRelationKey(memberId, targetId);
          const rel = state.relations[key];
          return rel && rel.status === 'alliance';
        });
        if (!alliedWithAll) continue;

        myBloc.members.push(targetId);

        events.push({
          turn: state.meta.turn,
          type: 'bloc_joined',
          description: `${target.name} joined the "${myBloc.name}" coalition!`,
          involvedEmpires: [...myBloc.members],
        });
      }
    }

    return events;
  }

  processLeaveBloc(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        if (action.type !== 'leave_bloc') continue;

        if (!state.blocs) continue;

        const myBloc = Object.values(state.blocs).find(
          b => b.members.includes(empireId)
        );
        if (!myBloc) continue;

        myBloc.members = myBloc.members.filter(id => id !== empireId);

        events.push({
          turn: state.meta.turn,
          type: 'bloc_left',
          description: `${empire.name} left the "${myBloc.name}" coalition!`,
          involvedEmpires: [empireId, ...myBloc.members],
        });

        if (myBloc.members.length <= 1) {
          const remaining = myBloc.members[0] ? state.empires[myBloc.members[0]] : null;
          events.push({
            turn: state.meta.turn,
            type: 'bloc_dissolved',
            description: `The "${myBloc.name}" coalition has dissolved!`,
            involvedEmpires: myBloc.members,
          });
          delete state.blocs[myBloc.id];
        }
      }
    }

    return events;
  }

  processBlocEmbargo(state, allActions) {
    const events = [];

    for (const [empireId, actions] of Object.entries(allActions)) {
      const empire = state.empires[empireId];
      if (!empire || empire.isEliminated) continue;

      for (const action of actions) {
        if (action.type !== 'bloc_embargo') continue;

        if (!state.blocs) continue;

        const myBloc = Object.values(state.blocs).find(
          b => b.founderId === empireId && b.members.includes(empireId)
        );
        if (!myBloc) continue;

        const targetId = action.target_empire_id;
        const target = state.empires[targetId];
        if (!target || target.isEliminated) continue;
        if (myBloc.members.includes(targetId)) continue;

        for (const memberId of myBloc.members) {
          const key = getRelationKey(memberId, targetId);
          const rel = state.relations[key];
          if (!rel) continue;
          if (rel.status === 'alliance') continue;

          if (rel.status === 'trade') {
            rel.status = 'neutral';
            rel.tradeValue = 0;
          }

          if (rel.embargo && rel.embargo !== memberId) {
            rel.embargo = 'mutual';
          } else {
            rel.embargo = memberId;
          }
        }

        events.push({
          turn: state.meta.turn,
          type: 'bloc_embargo',
          description: `The "${myBloc.name}" coalition imposed a collective EMBARGO on ${target.name}!`,
          involvedEmpires: [...myBloc.members, targetId],
        });
      }
    }

    return events;
  }

  checkBlocIntegrity(state) {
    const events = [];
    if (!state.blocs) return events;

    const toDelete = [];

    for (const bloc of Object.values(state.blocs)) {
      const toExpel = [];

      for (const memberId of bloc.members) {
        const empire = state.empires[memberId];
        if (empire?.isEliminated) {
          toExpel.push(memberId);
          continue;
        }

        const otherMembers = bloc.members.filter(id => id !== memberId);
        for (const otherId of otherMembers) {
          const key = getRelationKey(memberId, otherId);
          const rel = state.relations[key];
          if (!rel || rel.status !== 'alliance') {
            toExpel.push(memberId);
            break;
          }
        }
      }

      for (const expelId of [...new Set(toExpel)]) {
        bloc.members = bloc.members.filter(id => id !== expelId);
        const expelledName = state.empires[expelId]?.name || expelId;
        events.push({
          turn: state.meta.turn,
          type: 'bloc_expelled',
          description: `${expelledName} was expelled from the "${bloc.name}" coalition (alliance broken).`,
          involvedEmpires: [expelId, ...bloc.members],
        });
      }

      if (bloc.members.length <= 1) {
        events.push({
          turn: state.meta.turn,
          type: 'bloc_dissolved',
          description: `The "${bloc.name}" coalition has dissolved!`,
          involvedEmpires: bloc.members,
        });
        toDelete.push(bloc.id);
      }
    }

    for (const id of toDelete) {
      delete state.blocs[id];
    }

    return events;
  }
}
