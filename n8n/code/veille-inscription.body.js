// Telegram Trigger → commandes du bot : /start (inscrit ce chat, le premier verrouille), /veille (lance maintenant), /stop (libère).
// Sortie : { chatId, texte } à envoyer, { lancer: true } pour /veille, ou rien (chat inconnu ou message ignoré).
const statique = typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : {};
const v = statique.veille || (statique.veille = {});
const m = $input.first().json.message || {};
const chat = m.chat && m.chat.id;
const cmd = String(m.text || '').trim().split(/[\s@]/)[0].toLowerCase();
const repondre = texte => [{ json: { chatId: chat, texte } }];
if (!chat) return [];
if (cmd === '/start') {
  if (v.chatId && v.chatId !== chat) return [];
  v.chatId = chat;
  return repondre('✅ Alertes Notes Jeux activées. /veille = lancer maintenant, /stop = arrêter.');
}
if (!v.chatId || chat !== v.chatId) return [];
if (cmd === '/veille') return [{ json: { lancer: true } }];
if (cmd === '/stop') {
  delete v.chatId;
  return repondre('🔕 Alertes désactivées. /start pour les réactiver.');
}
return repondre('Commandes : /veille = lancer maintenant, /stop = arrêter les alertes.');
