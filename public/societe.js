// societe.js

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const $sidebar = document.getElementById('sidebar');
const $toggleAside = document.getElementById('toggleAside');
const $backdropSidebar = document.getElementById('backdrop-sidebar');
const $contacts = document.getElementById('contacts');
const $messages = document.getElementById('messages');
const $msgInput = document.getElementById('msg-input');
const $sendBtn = document.getElementById('send-btn');
const $imgInput = document.getElementById('img-input');
const $vidInput = document.getElementById('vid-input');
const $audioBtn = document.getElementById('audio-btn');
const $search = document.getElementById('searchContact');
const $cName = document.getElementById('c-name');
const $cAvatar = document.getElementById('c-avatar');
const $cStatus = document.getElementById('c-status');
const $myAvatar = document.getElementById('my-avatar');
const $myName = document.getElementById('my-name');
const $myStatus = document.getElementById('my-status');
const $callAudioBtn = document.getElementById('callAudioBtn');
const $callVideoBtn = document.getElementById('callVideoBtn');
const $hangupBtn = document.getElementById('hangupBtn');
const $remoteVideo = document.getElementById('remoteVideo');
const $remoteAudio = document.getElementById('remoteAudio');
const $myNameBlock = document.getElementById('my-name-block');
const $editMyName = document.getElementById('edit-my-name');
const $myNameInput = document.getElementById('my-name-input');

let currentUser = null;
let currentContact = null;
let unsubscribeMessages = null;
let contactsList = [];
let peer, peerId, currentPeerCall;

// ------ NAVBAR CONTACTS (hamburger partout) ------
function showAside() {
  $sidebar.classList.add('open');
  $backdropSidebar.classList.add('show');
}
function hideAside() {
  $sidebar.classList.remove('open');
  $backdropSidebar.classList.remove('show');
}
hideAside(); // Toujours caché au démarrage
$toggleAside.onclick = showAside;
$backdropSidebar.onclick = hideAside;
// ------ FIN NAVBAR CONTACTS ------

// Authentification Firebase
auth.onAuthStateChanged(async function(user) {
  if (!user) {
    await auth.signInAnonymously();
    return;
  }
  currentUser = user;
  $myAvatar.textContent = "🧑";
  $myStatus.textContent = "Connecté";
  addUserIfNotExist();
  loadContacts();
  setTimeout(setupPeer, 1200);
});

// Ajoute l'utilisateur si inexistant
async function addUserIfNotExist() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  if (!doc.exists) {
    await db.collection('users').doc(currentUser.uid).set({
      name: "Moi",
      avatar: "🧑",
      status: "Connecté"
    });
  } else {
    if (doc.data().name) $myName.textContent = doc.data().name;
    if (doc.data().avatar) $myAvatar.textContent = doc.data().avatar;
    if (doc.data().status) $myStatus.textContent = doc.data().status;
  }
}

// Chargement des contacts
function loadContacts() {
  db.collection('users').onSnapshot(function(snap) {
    contactsList = [];
    snap.forEach(function(doc) {
      if (doc.id !== currentUser.uid)
        contactsList.push({ ...doc.data(), id: doc.id });
    });
    renderContacts();
  });
}

// Affichage des contacts AVEC bouton suppression
function renderContacts(list = contactsList) {
  $contacts.innerHTML = '';
  list.forEach(function(ct) {
    let el = document.createElement('div');
    el.className = 'contact';
    el.dataset.id = ct.id;
    el.innerHTML = `
      <div class="avatar">${ct.avatar || ct.name?.charAt(0) || "?"}</div>
      <div class="details">
        <div class="cname">${ct.name || "Inconnu"}</div>
        <div class="clast"></div>
      </div>
      <button class="del-contact" title="Supprimer ce contact"><i class="fa fa-trash"></i></button>
    `;
    // Sélection contact
    el.onclick = function(e) {
      if (e.target.closest('.del-contact')) return;
      selectContact(ct);
    };
    // Suppression contact
    el.querySelector('.del-contact').onclick = function(e) {
      e.stopPropagation();
      if (confirm('Supprimer ce contact ?')) {
        db.collection('users').doc(ct.id).delete();
      }
    };
    $contacts.appendChild(el);
  });
}

// Sélection d'un contact (ferme menu partout)
function selectContact(ct) {
  currentContact = ct;
  $cName.textContent = ct.name || "Inconnu";
  $cAvatar.textContent = ct.avatar || ct.name?.charAt(0) || "?";
  $cStatus.textContent = ct.status || "Connecté";
  Array.from(document.getElementsByClassName('contact')).forEach(function(c) { c.classList.remove('active'); });
  let el = Array.from(document.getElementsByClassName('contact')).find(function(e) { return e.dataset.id === ct.id; });
  if (el) el.classList.add('active');
  loadMessages(ct.id);
  // Ferme menu après sélection
  if($sidebar.classList.contains('open')) hideAside();
}

// Recherche de contacts
$search.oninput = function() {
  let q = $search.value.toLowerCase();
  renderContacts(contactsList.filter(function(c) {
    return (c.name || "").toLowerCase().includes(q);
  }));
};

// =========== MESSAGES + STATUTS ===========
function loadMessages(contactId) {
  if (unsubscribeMessages) unsubscribeMessages();
  $messages.innerHTML = '';
  let chatId = chatKey(currentUser.uid, contactId);
  const msgsRef = db.collection('chats').doc(chatId).collection('msgs');
  unsubscribeMessages = msgsRef
    .orderBy('created', 'asc')
    .onSnapshot(function(snap) {
      $messages.innerHTML = '';
      let batch = db.batch();
      snap.forEach(function(doc) {
        let m = doc.data();
        let msg = document.createElement('div');
        msg.className = 'msg ' + (m.sender === currentUser.uid ? 'sent' : 'rcv');

        // Fallback pour les vieux messages sans status
        let msgStatus = m.status || 'sent';
        let tick = '';
        if (m.sender === currentUser.uid) {
          if (msgStatus === 'sent')         tick = '<span title="Envoyé" style="color:#aaa;"><i class="fa fa-check"></i></span>';
          else if (msgStatus === 'received')tick = '<span title="Reçu" style="color:#aaa;"><i class="fa fa-check-double"></i></span>';
          else if (msgStatus === 'read')    tick = '<span title="Lu" style="color:#25d366;"><i class="fa fa-check-double"></i></span>';
        }
        if (m.type === 'text') msg.innerHTML = sanitize(m.text) + `<div class="meta">${m.time} ${tick}</div>`;
        if (m.type === 'img') msg.innerHTML = `<img src="${m.url}" alt="image"><div class="meta">${m.time} ${tick}</div>`;
        if (m.type === 'vid') msg.innerHTML = `<video src="${m.url}" controls></video><div class="meta">${m.time} ${tick}</div>`;
        if (m.type === 'audio') msg.innerHTML = `<audio src="${m.url}" controls style="width:160px;"></audio><div class="meta">${m.time} ${tick}</div>`;
        $messages.appendChild(msg);

        // Statut reçu (côté destinataire)
        if (m.sender !== currentUser.uid && msgStatus === 'sent') {
          batch.update(msgsRef.doc(doc.id), { status: 'received' });
        }
      });
      batch.commit();
      $messages.scrollTop = 99999;

      // Statut lu (read) si la fenêtre est active
      markAllAsRead(msgsRef);
    });
}

function markAllAsRead(msgsRef) {
  setTimeout(async () => {
    const unread = await msgsRef.where('sender', '!=', currentUser.uid).where('status', '==', 'received').get();
    let batch = db.batch();
    unread.forEach(doc => batch.update(msgsRef.doc(doc.id), { status: 'read' }));
    if (!unread.empty) batch.commit();
  }, 400);
}

function chatKey(uid1, uid2) {
  return [uid1, uid2].sort().join('-');
}

$sendBtn.onclick = sendMsg;
$msgInput.onkeydown = function(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
};

function sendMsg() {
  let txt = $msgInput.value.trim();
  if (!txt || !currentContact) return;
  sendToFirebase({ type: 'text', text: txt });
  $msgInput.value = '';
}

function sendToFirebase(obj) {
  let chatId = chatKey(currentUser.uid, currentContact.id);
  // Ajout OBLIGATOIRE status
  let msgObj = {
    type: obj.type,
    text: obj.text || "",
    url: obj.url || "",
    sender: currentUser.uid,
    created: firebase.firestore.FieldValue.serverTimestamp(),
    time: now(),
    status: 'sent'
  };
  db.collection('chats').doc(chatId).collection('msgs').add(msgObj);
}

$imgInput.onchange = async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return alert("Image trop lourde !");
  const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1080, useWebWorker: true });
  const ref = storage.ref('images/' + Date.now() + "_" + compressed.name);
  const uploadTask = ref.put(compressed);
  uploadTask.on('state_changed', null, function(err) { alert("Upload image : " + err); }, function() {
    ref.getDownloadURL().then(function(url) {
      sendToFirebase({ type: 'img', url: url });
    });
  });
}

$vidInput.onchange = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) return alert("Vidéo trop lourde !");
  const ref = storage.ref('videos/' + Date.now() + "_" + file.name);
  const uploadTask = ref.put(file);
  uploadTask.on('state_changed', null, function(err) { alert("Upload vidéo : " + err); }, function() {
    ref.getDownloadURL().then(function(url) {
      sendToFirebase({ type: 'vid', url: url });
    });
  });
}

let mediaRecorder, audioChunks = [];
$audioBtn.onclick = async function() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    $audioBtn.innerHTML = '<i class="fa fa-microphone"></i>';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      if (blob.size > 500 * 1024) return alert("Audio trop long (max 500 Ko) !");
      const ref = storage.ref('audios/' + Date.now() + '.webm');
      const uploadTask = ref.put(blob);
      uploadTask.on('state_changed', null, err => alert("Upload audio : " + err), function() {
        ref.getDownloadURL().then(function(url) {
          sendToFirebase({ type: 'audio', url: url });
        });
      });
    };
    mediaRecorder.start();
    $audioBtn.innerHTML = '<i class="fa fa-stop"></i>';
  } catch (err) {
    alert("Impossible d’accéder au micro : " + err.message);
  }
};

function now() {
  let d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}
function sanitize(txt) {
  if (!txt) return '';
  return txt.replace(/[<>"']/g, function(c) { return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
}

// ========== APPELS AUDIO/VIDEO PEERJS ==========
function setupPeer() {
  peer = new Peer(undefined, { debug: 2 });
  peer.on('open', id => {
    peerId = id;
    db.collection('users').doc(currentUser.uid).update({ peerId: id });
  });
  peer.on('call', call => {
    let isVideo = call.metadata?.type === "video";
    if (confirm(`Appel entrant ${isVideo ? "vidéo" : "audio"} de ${getContactByPeerId(call.peer)?.name || "?"}. Accepter ?`)) {
      navigator.mediaDevices.getUserMedia({audio:true, video:isVideo}).then(stream=>{
        call.answer(stream);
        handlePeerCall(call, isVideo);
      });
    } else {
      call.close();
    }
  });
}
function getContactByPeerId(peerid) {
  return contactsList.find(c => c.peerId === peerid);
}

$callAudioBtn.onclick = async function() {
  if (!currentContact || !currentContact.peerId) return alert("Contact non joignable ou pas en ligne !");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const call = peer.call(currentContact.peerId, stream, {metadata:{type:'audio'}});
  handlePeerCall(call, false);
};

$callVideoBtn.onclick = async function() {
  if (!currentContact || !currentContact.peerId) return alert("Contact non joignable ou pas en ligne !");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  const call = peer.call(currentContact.peerId, stream, {metadata:{type:'video'}});
  handlePeerCall(call, true);
};

function handlePeerCall(call, isVideo) {
  currentPeerCall = call;
  $hangupBtn.style.display = "";
  call.on('stream', remoteStream => {
    if (isVideo) {
      $remoteVideo.srcObject = remoteStream;
      $remoteVideo.style.display = "block";
      $remoteAudio.style.display = "none";
    } else {
      $remoteAudio.srcObject = remoteStream;
      $remoteAudio.style.display = "block";
      $remoteVideo.style.display = "none";
    }
  });
  call.on('close', () => {
    $remoteAudio.srcObject = null;
    $remoteVideo.srcObject = null;
    $remoteAudio.style.display = "none";
    $remoteVideo.style.display = "none";
    $hangupBtn.style.display = "none";
  });
}
$hangupBtn.onclick = function() {
  if(currentPeerCall) currentPeerCall.close();
  $hangupBtn.style.display = "none";
};

// --- EDITION DU NOM ---
$editMyName.onclick = function() {
  $myNameInput.value = $myName.textContent.trim();
  $myName.style.display = "none";
  $editMyName.style.display = "none";
  $myNameInput.style.display = "";
  $myNameInput.focus();
};
$myNameInput.onkeydown = function(e) {
  if(e.key==="Enter") this.blur();
};
$myNameInput.onblur = async function() {
  let newName = $myNameInput.value.trim();
  if(!newName) newName = "Moi";
  $myName.textContent = newName;
  $myName.style.display = "";
  $editMyName.style.display = "";
  $myNameInput.style.display = "none";
  // Mise à jour en base
  if(currentUser) {
    await db.collection('users').doc(currentUser.uid).update({ name: newName });
  }
};
