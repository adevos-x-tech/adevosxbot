// This file previously implemented an activity-based "who's active"
// proxy, built before online.js's real implementation was found in a
// later pass. online.js already does this properly with genuine Baileys
// presence subscription (sock.presenceSubscribe + presence.update
// listener) and claims the 'listonline' alias — a real command here too
// would collide with it. Delete the messageStats.js getRecentlyActive-based
// version; .listonline / .online / .whosonline all point to online.js now.

module.exports = [];
