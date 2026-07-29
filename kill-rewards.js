// kill-rewards.js — FORESTWAR killstreak-reward dispatcher.
// A tiny publish/subscribe bus that every player kill is announced on. Reward
// systems (owl strike, gunship, future streaks) register a listener and track
// their own progress, so we never have to wire each individual weapon into each
// reward. Fed from the central player-kill path in entities.js (rifle / rocket /
// grenade) and from melee.js (bayonet) — every way the player can score a kill.
(() => {
  const listeners = [];

  function register(fn) {
    if (typeof fn === 'function' && listeners.indexOf(fn) === -1) listeners.push(fn);
  }

  // victimTeam: the team of the fighter the player just downed ('deer' | 'hunter').
  // The dispatcher only ever fires for player-sourced kills, so the victim is
  // always on the opposing side — but listeners may still re-check defensively.
  function notify(victimTeam) {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](victimTeam); }
      catch (err) { console.warn('KillRewards listener failed:', err); }
    }
  }

  function clear() { listeners.length = 0; }

  window.KillRewards = { register, notify, clear };
})();
