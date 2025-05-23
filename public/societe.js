import { getDatabase, ref, push, onChildAdded, remove, get, set, onValue, off } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDocs, collection, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// 🔥 Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAxUcOrQ0IX6Soz77nH8LKWOvkrHxJfCbY",
  authDomain: "prixjour.firebaseapp.com",
  projectId: "prixjour",
  storageBucket: "prixjour.firebasestorage.app",
  messagingSenderId: "468819038880",
  appId: "1:468819038880:web:b3809587a096cc046defc5",
  measurementId: "G-JY8YT5S6QX"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const firestore = getFirestore(app);

// Variable pour gérer le mode suppression
let deletionMode = false;

(async function() {
  // ===================== Gestion du numéro de téléphone unique =====================
  function generatePhoneNumber() {
    const prefix = Math.random() < 0.5 ? "06" : "07";
    let number = prefix;
    for (let i = 0; i < 8; i++) {
      number += Math.floor(Math.random() * 10);
    }
    return number;
  }
  
  let myPhoneNumber = localStorage.getItem("myPhoneNumber");
  if (!myPhoneNumber) {
    myPhoneNumber = generatePhoneNumber();
    localStorage.setItem("myPhoneNumber", myPhoneNumber);
  }
  
  // Enregistrer l'utilisateur dans Firestore (collection "users")
  await setDoc(doc(firestore, "users", myPhoneNumber), { phone: myPhoneNumber }, { merge: true });
  
  // Affichage du numéro dans l'en-tête du chat (page de chat)
  const chatHeader = document.querySelector(".chat-header");
  if (chatHeader) {
    const phoneDisplay = document.createElement("span");
    phoneDisplay.style.fontSize = "0.8rem";
    phoneDisplay.style.marginLeft = "10px";
    const currentUserDoc = await getDoc(doc(firestore, "users", myPhoneNumber));
    const currentUserData = currentUserDoc.data();
    const myName = currentUserData && currentUserData.name ? currentUserData.name : "";
    phoneDisplay.textContent = myName ? `${myName} (${myPhoneNumber})` : `Votre numéro: ${myPhoneNumber}`;
    chatHeader.appendChild(phoneDisplay);
    
    // Bouton pour supprimer votre numéro dans Firestore
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Supprimer mon numéro";
    deleteBtn.style.marginLeft = "10px";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Êtes-vous sûr de vouloir supprimer votre numéro ?")) {
        await deleteDoc(doc(firestore, "users", myPhoneNumber));
        localStorage.removeItem("myPhoneNumber");
        alert("Votre numéro a été supprimé.");
      }
    });
    chatHeader.appendChild(deleteBtn);
  }
  
  // ===================== Variables globales =====================
  let activeChatTarget = null;         // Numéro du contact sélectionné
  let conversationRef = null;          // Référence de la conversation dans RTDB
  let conversationListener = null;     // Listener pour les messages de la conversation
  
  // Sélection des éléments HTML
  const chatBox    = document.getElementById("chat-box");
  const chatInput  = document.getElementById("chat-input");
  const sendBtn    = document.getElementById("send-btn");
  const recordBtn  = document.getElementById("record-btn");
  const stopBtn    = document.getElementById("stop-btn");
  const imageInput = document.getElementById("image-input");
  const videoInput = document.getElementById("video-input");
  const callBtn    = document.getElementById("call-btn");
  const answerBtn  = document.getElementById("answer-btn");
  const remoteAudio= document.getElementById("remote-audio");
  const hangupBtn  = document.getElementById("hangup-btn");
  
  if (!chatBox || !chatInput || !sendBtn || !recordBtn || !stopBtn || !imageInput || !videoInput || !callBtn || !answerBtn || !remoteAudio || !hangupBtn) {
    console.error("❌ ERREUR : Un ou plusieurs éléments HTML manquent !");
  }
  
  // ===================== Fonction utilitaire pour la date =====================
  function getFormattedDate() {
    const now = new Date();
    return now.toLocaleString("fr-FR", { 
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  
  // ===================== Génération de l'ID de conversation =====================
  function getConversationId(phoneA, phoneB) {
    return [phoneA, phoneB].sort().join("_");
  }
  
  // ===================== Notifications =====================
  // Ajoute une notification pour le destinataire (message ou appel entrant)
  function addNotification(recipient) {
    const notifRef = ref(database, `notifications/${recipient}`);
    push(notifRef, {
      from: myPhoneNumber,
      timestamp: Date.now()
    });
  }
  
  // Récupère les notifications pour l'utilisateur courant et les regroupe par numéro d'expéditeur.
  async function getNotifications() {
    const notifRef = ref(database, `notifications/${myPhoneNumber}`);
    const snapshot = await get(notifRef);
    const notifications = snapshot.val() || {};
    const grouped = {};
    Object.values(notifications).forEach(notif => {
      if (notif.from) {
        grouped[notif.from] = (grouped[notif.from] || 0) + 1;
      }
    });
    return grouped;
  }
  
  // Efface les notifications pour un contact donné dès l'ouverture de la conversation.
  function clearNotificationsFor(contact) {
    const notifRef = ref(database, `notifications/${myPhoneNumber}`);
    get(notifRef).then(snapshot => {
      const notifs = snapshot.val();
      if (notifs) {
        Object.keys(notifs).forEach(key => {
          if (notifs[key].from === contact) {
            remove(ref(database, `notifications/${myPhoneNumber}/${key}`));
          }
        });
      }
    });
  }
  
  // ===================== Mise à jour du badge de l'application =====================
  // Utilise la Badging API si disponible, sinon met à jour le titre de la page.
  function updateAppBadge() {
    const notifRef = ref(database, `notifications/${myPhoneNumber}`);
    onValue(notifRef, (snapshot) => {
      const notifications = snapshot.val() || {};
      const count = Object.keys(notifications).length;
      if (navigator.setAppBadge) {
        navigator.setAppBadge(count).catch(console.error);
      } else {
        document.title = count ? `(${count}) Chat App` : "Chat App";
      }
    });
  }
  
  // Lancer la mise à jour du badge dès l'initialisation.
  updateAppBadge();
  
  // ===================== Affichage de la liste des contacts (page d'accueil) =====================
  async function displayContacts() {
    const contactsContainer = document.querySelector(".contacts-container");
    
    // Afficher votre propre numéro
    let myNumberElement = document.getElementById("my-number");
    if (!myNumberElement) {
      myNumberElement = document.createElement("div");
      myNumberElement.id = "my-number";
      myNumberElement.style.fontWeight = "bold";
      myNumberElement.style.marginBottom = "10px";
      contactsContainer.insertBefore(myNumberElement, contactsContainer.firstChild);
    }
    
    const currentUserDoc = await getDoc(doc(firestore, "users", myPhoneNumber));
    const currentUserData = currentUserDoc.data();
    const myName = currentUserData && currentUserData.name ? currentUserData.name : "";
    myNumberElement.textContent = myName ? `${myName} (${myPhoneNumber})` : `Votre numéro: ${myPhoneNumber}`;
    
    // Bouton "+" pour associer ou modifier un nom
    let addNameBtn = document.getElementById("add-name-btn");
    if (!addNameBtn) {
      addNameBtn = document.createElement("button");
      addNameBtn.id = "add-name-btn";
      addNameBtn.textContent = " + ";
      addNameBtn.style.marginLeft = "10px";
      addNameBtn.addEventListener("click", async () => {
        const newName = prompt("Entrez le nom à associer à votre numéro :");
        if (newName && newName.trim() !== "") {
          await setDoc(doc(firestore, "users", myPhoneNumber), { name: newName.trim() }, { merge: true });
          alert("Nom mis à jour !");
          displayContacts();
        }
      });
      myNumberElement.appendChild(addNameBtn);
    }
    
    // Bouton "-" pour activer le mode suppression
    let deleteModeBtn = document.getElementById("delete-mode-btn");
    if (!deleteModeBtn) {
      deleteModeBtn = document.createElement("button");
      deleteModeBtn.id = "delete-mode-btn";
      deleteModeBtn.textContent = " - ";
      deleteModeBtn.style.marginLeft = "10px";
      deleteModeBtn.addEventListener("click", () => {
        deletionMode = !deletionMode;
        if (deletionMode) {
          alert("Mode suppression activé. Cliquez sur le contact à supprimer.");
          deleteModeBtn.style.backgroundColor = "#ffcccc";
        } else {
          deleteModeBtn.style.backgroundColor = "";
        }
      });
      myNumberElement.appendChild(deleteModeBtn);
    }
    
    // Réinitialiser la liste des contacts
    const contactListElement = document.getElementById("phone-list");
    contactListElement.innerHTML = "";
  
    // Récupérer les notifications pour l'utilisateur courant
    const notificationsGrouped = await getNotifications();
  
    const usersSnapshot = await getDocs(collection(firestore, "users"));
    usersSnapshot.forEach(docSnapshot => {
      const contactNumber = docSnapshot.id;
      if (contactNumber !== myPhoneNumber) {
        const data = docSnapshot.data();
        const contactName = data.name ? data.name : "";
        const displayText = contactName ? `${contactName} (${contactNumber})` : contactNumber;
        
        const contactItem = document.createElement("div");
        contactItem.textContent = displayText;
        contactItem.classList.add("contact-item");
        contactItem.style.cursor = "pointer";
        
        // Si des notifications existent pour ce contact, ajouter un badge
        if (notificationsGrouped[contactNumber]) {
          const badge = document.createElement("span");
          badge.textContent = ` - Nouveau message `;
          badge.style.color = "red";
          badge.style.fontSize = "0.8rem";
          badge.style.marginLeft = "10px";
          contactItem.appendChild(badge);
        }
        
        contactItem.addEventListener("click", async () => {
          if (deletionMode) {
            if (confirm("Êtes-vous sûr de vouloir supprimer ce contact ?")) {
              await deleteDoc(doc(firestore, "users", contactNumber));
              alert("Contact supprimé !");
              deletionMode = false;
              deleteModeBtn.style.backgroundColor = "";
              displayContacts();
            }
          } else {
            activeChatTarget = contactNumber;
            loadChatForContact(activeChatTarget);
          }
        });
  
        contactListElement.appendChild(contactItem);
      }
    });
    
    // SI un appel est en cours, ajouter un bouton "Terminer l'appel" dans la page contacts
    if (callId) {
      let globalHangup = document.getElementById("global-hangup");
      if (!globalHangup) {
        globalHangup = document.createElement("button");
        globalHangup.id = "global-hangup";
        globalHangup.textContent = "Terminer l'appel";
        globalHangup.style.marginTop = "10px";
        globalHangup.addEventListener("click", () => {
          endCall();
        });
        contactsContainer.appendChild(globalHangup);
      }
    } else {
      const existingHangup = document.getElementById("global-hangup");
      if (existingHangup) {
        existingHangup.remove();
      }
    }
  }
  
  // ===================== Chargement de la conversation d'un contact =====================
  function loadChatForContact(contact) {
    // Masquer la page d'accueil et afficher la page de chat
    document.getElementById("contacts-page").style.display = "none";
    document.getElementById("chat-page").style.display = "block";
  
    // Bouton "Retour aux contacts"
    let backButton = document.getElementById("back-button");
    if (!backButton) {
      backButton = document.createElement("button");
      backButton.textContent = "Retour aux contacts";
      backButton.id = "back-button";
      backButton.style.marginLeft = "10px";
      backButton.addEventListener("click", () => {
        if (conversationRef && conversationListener) {
          off(conversationRef, "child_added", conversationListener);
        }
        chatBox.innerHTML = "";
        document.getElementById("chat-page").style.display = "none";
        document.getElementById("contacts-page").style.display = "block";
        displayContacts();
      });
      chatHeader.appendChild(backButton);
    }
  
    // Effacer les notifications pour ce contact dès l'ouverture de la conversation
    clearNotificationsFor(contact);
  
    const convId = getConversationId(myPhoneNumber, contact);
    if (conversationRef && conversationListener) {
      off(conversationRef, "child_added", conversationListener);
    }
    conversationRef = ref(database, "chats/" + convId);
    chatBox.innerHTML = "";
  
    conversationListener = onChildAdded(conversationRef, snapshot => {
      const data = snapshot.val();
      const messageId = snapshot.key;
      const messageElement = document.createElement("div");
      messageElement.classList.add("message", data.from === myPhoneNumber ? "sent" : "received");
      messageElement.setAttribute("data-id", messageId);
  
      if (data.text) {
        messageElement.innerHTML = `<strong>${data.from}:</strong> ${data.text}`;
      } else if (data.image) {
        const img = document.createElement("img");
        img.src = data.image;
        img.alt = "Image envoyée";
        img.style.maxWidth = "100%";
        messageElement.appendChild(img);
      } else if (data.audio) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = data.audio;
        messageElement.appendChild(audio);
      } else if (data.video) {
        const video = document.createElement("video");
        video.controls = true;
        video.src = data.video;
        video.style.maxWidth = "100%";
        messageElement.appendChild(video);
      }
  
      const timeStamp = document.createElement("span");
      timeStamp.classList.add("timestamp");
      timeStamp.textContent = data.dateFormatted;
      messageElement.appendChild(timeStamp);
  
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️";
      deleteBtn.classList.add("delete-btn");
      deleteBtn.onclick = () => deleteMessage(messageId, convId);
      messageElement.appendChild(deleteBtn);
  
      chatBox.appendChild(messageElement);
      chatBox.scrollTop = chatBox.scrollHeight;
      playNotificationSound();
    });
  }
  
  // ===================== Suppression d'un message =====================
  function deleteMessage(messageId, convId) {
    remove(ref(database, `chats/${convId}/${messageId}`))
      .then(() => {
        document.querySelector(`[data-id='${messageId}']`)?.remove();
      })
      .catch(console.error);
  }
  
  // ===================== Envoi de messages et gestion des médias =====================
  sendBtn.addEventListener("click", () => {
    const message = chatInput.value.trim();
    if (message !== "" && conversationRef) {
      push(conversationRef, {
        from: myPhoneNumber,
        to: activeChatTarget,
        text: message,
        timestamp: Date.now(),
        dateFormatted: getFormattedDate()
      });
      // Ajoute une notification pour le destinataire si ce n'est pas vous-même.
      if (activeChatTarget !== myPhoneNumber) {
        addNotification(activeChatTarget);
      }
      chatInput.value = "";
    }
  });
  
  imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file && conversationRef) {
      const reader = new FileReader();
      reader.onloadend = () => {
        push(conversationRef, {
          from: myPhoneNumber,
          to: activeChatTarget,
          image: reader.result,
          timestamp: Date.now(),
          dateFormatted: getFormattedDate()
        });
      };
      reader.readAsDataURL(file);
    }
  });
  
  videoInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file && conversationRef) {
      const reader = new FileReader();
      reader.onloadend = () => {
        push(conversationRef, {
          from: myPhoneNumber,
          to: activeChatTarget,
          video: reader.result,
          timestamp: Date.now(),
          dateFormatted: getFormattedDate()
        });
      };
      reader.readAsDataURL(file);
    }
  });
  
  let mediaRecorder;
  let audioChunks = [];
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const reader = new FileReader();
      reader.onloadend = () => {
        if (conversationRef) {
          push(conversationRef, {
            from: myPhoneNumber,
            to: activeChatTarget,
            audio: reader.result,
            timestamp: Date.now(),
            dateFormatted: getFormattedDate()
          });
        }
      };
      reader.readAsDataURL(audioBlob);
      audioChunks = [];
    };
    recordBtn.addEventListener("click", () => {
      mediaRecorder.start();
      recordBtn.disabled = true;
      stopBtn.disabled = false;
    });
    stopBtn.addEventListener("click", () => {
      mediaRecorder.stop();
      recordBtn.disabled = false;
      stopBtn.disabled = true;
    });
  });
  
  // ===================== Notifications Audio =====================
  const notificationSound = new Audio('phone_ring_tone.wav');
  function playNotificationSound() {
    notificationSound.play().catch(error => {
      console.error("Erreur lors de la lecture du son de notification:", error);
    });
    setTimeout(() => {
      notificationSound.play().catch(error => {
        console.error("Erreur lors de la lecture du son de notification:", error);
      });
    }, 1000);
  }
  
  // ===================== WebRTC & Appels Privés =====================
  let localStream;
  let peerConnection;
  let callId;
  const rtcServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  function generateCallId() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }
  
  let callInitiator = false;
  
  function initPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcServers);
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    peerConnection.ontrack = event => {
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.muted = false;
      remoteAudio.volume = 1.0;
      remoteAudio.play().catch(error => {
        console.error("Erreur lors de la lecture de l'audio :", error);
      });
    };
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        if (callInitiator) {
          push(ref(database, `calls/${callId}/candidates/caller`), event.candidate.toJSON());
        } else {
          push(ref(database, `calls/${callId}/candidates/answerer`), event.candidate.toJSON());
        }
      }
    };
  }
  
  function endCall() {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    if (callId) {
      set(ref(database, `calls/${callId}/status`), 'ended').catch(console.error);
    }
    hangupBtn.disabled = true;
    callBtn.disabled = false;
    answerBtn.disabled = false;
    window.updateCallDisplay && window.updateCallDisplay(null, null);
    callId = null;
    // Met à jour l'interface (contacts) pour retirer le bouton "Terminer l'appel" s'il existe
    displayContacts();
  }
  
  async function initiateCallTo(targetPhoneNumber) {
    try {
      callInitiator = true;
      callBtn.disabled = true;
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      callId = generateCallId();
      initPeerConnection();
      const offerDescription = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offerDescription);
      const callData = {
        offer: {
          type: offerDescription.type,
          sdp: offerDescription.sdp
        },
        status: 'waiting',
        from: myPhoneNumber,
        target: targetPhoneNumber,
        timestamp: Date.now()
      };
      await set(ref(database, `calls/${callId}`), callData);
      if (conversationRef) {
        push(conversationRef, {
          from: "Système",
          text: `📞 Appel en cours vers ${targetPhoneNumber}... ID d'appel : ${callId}.`,
          timestamp: Date.now(),
          dateFormatted: getFormattedDate()
        });
      }
      push(ref(database, "ringtoneEvents"), { callId: callId, timestamp: Date.now() });
      
      onValue(ref(database, `calls/${callId}/answer`), async snapshot => {
        const answer = snapshot.val();
        if (answer && !peerConnection.currentRemoteDescription) {
          const answerDescription = new RTCSessionDescription(answer);
          await peerConnection.setRemoteDescription(answerDescription);
        }
      });
      onChildAdded(ref(database, `calls/${callId}/candidates/answerer`), async snapshot => {
        const candidate = new RTCIceCandidate(snapshot.val());
        await peerConnection.addIceCandidate(candidate);
      });
      hangupBtn.disabled = false;
      // Mise à jour de la page contacts pour afficher le bouton "Terminer l'appel"
      displayContacts();
    } catch (error) {
      console.error("Erreur lors de l'initiation de l'appel :", error);
      callBtn.disabled = false;
    }
  }
  
  async function answerIncomingCall(callIdIncoming, callData) {
    try {
      callInitiator = false;
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initPeerConnection();
      const offerDescription = new RTCSessionDescription(callData.offer);
      await peerConnection.setRemoteDescription(offerDescription);
      const answerDescription = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answerDescription);
      const answerData = {
        type: answerDescription.type,
        sdp: answerDescription.sdp
      };
      await set(ref(database, `calls/${callIdIncoming}/answer`), answerData);
      await set(ref(database, `calls/${callIdIncoming}/status`), 'connected');
      
      onChildAdded(ref(database, `calls/${callIdIncoming}/candidates/caller`), async snapshot => {
        const candidate = new RTCIceCandidate(snapshot.val());
        await peerConnection.addIceCandidate(candidate);
      });
      if (conversationRef) {
        push(conversationRef, {
          from: "Système",
          text: `📞 Vous avez répondu à l'appel ${callIdIncoming} provenant de ${callData.from}`,
          timestamp: Date.now(),
          dateFormatted: getFormattedDate()
        });
      }
      hangupBtn.disabled = false;
      // Ouvrir automatiquement la page de chat en chargeant la conversation avec l'appelant
      activeChatTarget = callData.from;
      document.getElementById("contacts-page").style.display = "none";
      document.getElementById("chat-page").style.display = "block";
      loadChatForContact(activeChatTarget);
      // Mise à jour de la page contacts pour afficher le bouton "Terminer l'appel"
      displayContacts();
    } catch (error) {
      console.error("Erreur lors de la réponse à l'appel entrant :", error);
    }
  }
  
  // ===================== Gestion des appels entrants =====================
  const callsRef = ref(database, "calls");
  onChildAdded(callsRef, snapshot => {
    const callData = snapshot.val();
    const currentCallId = snapshot.key;
    // Si un appel est destiné à mon numéro et est en attente
    if (callData.target === myPhoneNumber && callData.status === 'waiting') {
      if (confirm(`Vous recevez un appel de ${callData.from}. Voulez-vous répondre ?`)) {
        answerIncomingCall(currentCallId, callData);
      } else {
        // Si l'appel est refusé, mettre à jour le statut de l'appel
        set(ref(database, `calls/${currentCallId}/status`), 'rejected');
      }
    }
  });
  
  callBtn.addEventListener("click", async () => {
    const targetPhoneNumber = prompt("Entrez le numéro de téléphone à appeler :");
    if (targetPhoneNumber) {
      await initiateCallTo(targetPhoneNumber);
    }
  });
  
  answerBtn.addEventListener("click", async () => {
    const promptCallId = prompt("Entrez l'ID de l'appel pour répondre :");
    if (!promptCallId) return;
    callId = promptCallId;
    const callSnapshot = await get(ref(database, `calls/${callId}`));
    const callData = callSnapshot.val();
    if (!callData || !callData.offer) {
      alert("Appel non trouvé ou déjà terminé.");
      return;
    }
    await answerIncomingCall(callId, callData);
  });
  
  hangupBtn.addEventListener("click", () => {
    endCall();
  });
  
  // ===================== Appel initial : afficher la liste des contacts =====================
  displayContacts();
})();
