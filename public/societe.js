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
  await setDoc(doc(firestore, "users", myPhoneNumber), { 
    phone: myPhoneNumber, 
    lastOnline: Date.now(),
    isOnline: true 
  }, { merge: true });
  
  // Mettre à jour le statut en ligne périodiquement
  setInterval(async () => {
    await setDoc(doc(firestore, "users", myPhoneNumber), { 
      lastOnline: Date.now(),
      isOnline: true 
    }, { merge: true });
  }, 30000); // Toutes les 30 secondes
  
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
  }
  
  // ===================== Variables globales =====================
  let activeChatTarget = null;         // Numéro du contact sélectionné
  let conversationRef = null;          // Référence de la conversation dans RTDB
  let conversationListener = null;     // Listener pour les messages de la conversation
  let contactsData = new Map();        // Cache des données de contacts
  let lastMessages = new Map();        // Cache des derniers messages
  
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

  function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString("fr-FR", { 
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'maintenant';
    if (minutes < 60) return `il y a ${minutes}min`;
    if (hours < 24) return `il y a ${hours}h`;
    if (days < 7) return `il y a ${days}j`;
    
    return new Date(timestamp).toLocaleDateString("fr-FR", { 
      day: "2-digit", 
      month: "2-digit" 
    });
  }
  
  // ===================== Génération de l'ID de conversation =====================
  function getConversationId(phoneA, phoneB) {
    return [phoneA, phoneB].sort().join("_");
  }
  
  // ===================== Gestion des statuts de messages =====================
  
  // Marquer un message comme lu
  function markMessageAsRead(messageId, convId) {
    const messageRef = ref(database, `chats/${convId}/${messageId}`);
    set(messageRef, { read: true }, { merge: true });
  }

  // Marquer un message comme livré
  function markMessageAsDelivered(messageId, convId) {
    const messageRef = ref(database, `chats/${convId}/${messageId}`);
    set(messageRef, { delivered: true }, { merge: true });
  }

  // Obtenir le dernier message d'une conversation
  async function getLastMessage(contactNumber) {
    const convId = getConversationId(myPhoneNumber, contactNumber);
    const messagesRef = ref(database, `chats/${convId}`);
    
    try {
      const snapshot = await get(messagesRef);
      const messages = snapshot.val();
      
      if (!messages) return null;
      
      const messagesList = Object.entries(messages);
      messagesList.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
      
      const lastMessage = messagesList[0];
      if (lastMessage) {
        const [messageId, messageData] = lastMessage;
        return {
          id: messageId,
          ...messageData,
          time: getRelativeTime(messageData.timestamp || Date.now())
        };
      }
    } catch (error) {
      console.error("Erreur lors de la récupération du dernier message:", error);
    }
    
    return null;
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
  function updateAppBadge() {
    const notifRef = ref(database, `notifications/${myPhoneNumber}`);
    onValue(notifRef, (snapshot) => {
      const notifications = snapshot.val() || {};
      const count = Object.keys(notifications).length;
      if (navigator.setAppBadge) {
        navigator.setAppBadge(count).catch(console.error);
      } else {
        document.title = count ? `(${count}) WhatsApp Web` : "WhatsApp Web";
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
      contactsContainer.insertBefore(myNumberElement, contactsContainer.firstChild.nextSibling);
    }
    
    const currentUserDoc = await getDoc(doc(firestore, "users", myPhoneNumber));
    const currentUserData = currentUserDoc.data();
    const myName = currentUserData && currentUserData.name ? currentUserData.name : "";
    myNumberElement.innerHTML = '';
    myNumberElement.textContent = myName ? `${myName} (${myPhoneNumber})` : `Votre numéro: ${myPhoneNumber}`;
    
    // Bouton "+" pour associer ou modifier un nom
    let addNameBtn = document.getElementById("add-name-btn");
    if (!addNameBtn) {
      addNameBtn = document.createElement("button");
      addNameBtn.id = "add-name-btn";
      addNameBtn.textContent = " + ";
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
    const contactPromises = [];
    
    usersSnapshot.forEach(docSnapshot => {
      const contactNumber = docSnapshot.id;
      if (contactNumber !== myPhoneNumber) {
        contactPromises.push(createContactItem(contactNumber, docSnapshot.data(), notificationsGrouped[contactNumber] || 0));
      }
    });
    
    // Attendre que tous les contacts soient créés
    const contactElements = await Promise.all(contactPromises);
    
    // Trier les contacts par dernière activité
    contactElements.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    
    // Ajouter les contacts à la liste
    contactElements.forEach(contactElement => {
      if (contactElement.element) {
        contactListElement.appendChild(contactElement.element);
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

  // Créer un élément de contact avec les nouvelles fonctionnalités
  async function createContactItem(contactNumber, contactData, unreadCount) {
    const contactName = contactData.name || "";
    const isOnline = contactData.isOnline || false;
    const lastOnline = contactData.lastOnline || 0;
    
    // Récupérer le dernier message
    const lastMessage = await getLastMessage(contactNumber);
    
    // Déterminer le statut du message s'il vient de nous
    let messageStatus = null;
    if (lastMessage && lastMessage.from === myPhoneNumber) {
      if (lastMessage.read) {
        messageStatus = 'read';
      } else if (lastMessage.delivered) {
        messageStatus = 'delivered';
      } else {
        messageStatus = 'sent';
      }
    }
    
    // Créer l'élément de contact avec le nouveau design
    const contactElement = window.createContactElement({
      number: contactNumber,
      name: contactName,
      lastMessage: lastMessage ? (lastMessage.text || '📷 Image' || '🎵 Audio' || '📹 Vidéo') : 'Nouveau contact',
      time: lastMessage ? lastMessage.time : getRelativeTime(lastOnline),
      unreadCount: unreadCount,
      isOnline: isOnline,
      messageStatus: messageStatus
    });
    
    // Ajouter l'événement de clic
    contactElement.addEventListener("click", async () => {
      if (deletionMode) {
        if (confirm("Êtes-vous sûr de vouloir supprimer ce contact ?")) {
          await deleteDoc(doc(firestore, "users", contactNumber));
          alert("Contact supprimé !");
          deletionMode = false;
          document.getElementById("delete-mode-btn").style.backgroundColor = "";
          displayContacts();
        }
      } else {
        // Retirer la classe active de tous les contacts
        document.querySelectorAll('.contact-item').forEach(item => {
          item.classList.remove('active');
        });
        
        // Ajouter la classe active au contact sélectionné
        contactElement.classList.add('active');
        
        activeChatTarget = contactNumber;
        loadChatForContact(activeChatTarget);
      }
    });
    
    return {
      element: contactElement,
      lastMessageTime: lastMessage ? lastMessage.timestamp : 0
    };
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
      backButton.textContent = "← Retour";
      backButton.id = "back-button";
      backButton.addEventListener("click", () => {
        if (conversationRef && conversationListener) {
          off(conversationRef, "child_added", conversationListener);
        }
        chatBox.innerHTML = "";
        document.getElementById("chat-page").style.display = "none";
        document.getElementById("contacts-page").style.display = "block";
        activeChatTarget = null;
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
        const textDiv = document.createElement("div");
        textDiv.classList.add("message-text");
        textDiv.textContent = data.text;
        messageElement.appendChild(textDiv);
      } else if (data.image) {
        const img = document.createElement("img");
        img.src = data.image;
        img.alt = "Image envoyée";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "8px";
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

      // Timestamp avec statut
      const timeStamp = document.createElement("span");
      timeStamp.classList.add("timestamp");
      timeStamp.textContent = data.dateFormatted || getFormattedDate();
      
      // Ajouter les indicateurs de statut pour les messages envoyés
      if (data.from === myPhoneNumber) {
        let status = 'sent';
        if (data.read) {
          status = 'read';
        } else if (data.delivered) {
          status = 'delivered';
        }
        window.updateMessageStatus(messageElement, status);
      }
      
      messageElement.appendChild(timeStamp);

      // Bouton de suppression
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️";
      deleteBtn.classList.add("delete-btn");
      deleteBtn.onclick = () => deleteMessage(messageId, convId);
      messageElement.appendChild(deleteBtn);

      chatBox.appendChild(messageElement);
      chatBox.scrollTop = chatBox.scrollHeight;
      
      // Marquer automatiquement comme lu si c'est un message reçu
      if (data.from !== myPhoneNumber && !data.read) {
        setTimeout(() => {
          markMessageAsRead(messageId, convId);
        }, 1000);
      }
      
      // Marquer comme livré si c'est un message reçu
      if (data.from !== myPhoneNumber && !data.delivered) {
        markMessageAsDelivered(messageId, convId);
      }
      
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
        dateFormatted: getFormattedDate(),
        sent: true,
        delivered: false,
        read: false
      });
      // Ajoute une notification pour le destinataire
      if (activeChatTarget !== myPhoneNumber) {
        addNotification(activeChatTarget);
      }
      chatInput.value = "";
    }
  });
  
  // Envoi avec Enter
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendBtn.click();
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
          dateFormatted: getFormattedDate(),
          sent: true,
          delivered: false,
          read: false
        });
        if (activeChatTarget !== myPhoneNumber) {
          addNotification(aktiveChatTarget);
        }
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
          dateFormatted: getFormattedDate(),
          sent: true,
          delivered: false,
          read: false
        });
        if (activeChatTarget !== myPhoneNumber) {
          addNotification(activeChatTarget);
        }
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
            dateFormatted: getFormattedDate(),
            sent: true,
            delivered: false,
            read: false
          });
          if (activeChatTarget !== myPhoneNumber) {
            addNotification(activeChatTarget);
          }
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
    window.hideCallInterface && window.hideCallInterface();
    callId = null;
    displayContacts();
  }
  
  // Exposer la fonction endCall globalement
  window.endCall = endCall;
  
  async function initiateCallTo(targetPhoneNumber) {
    try {
      callInitiator = true;
      callBtn.disabled = true;
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      callId = generateCallId();
      
      // Afficher l'interface d'appel
      const contactDoc = await getDoc(doc(firestore, "users", targetPhoneNumber));
      const contactData = contactDoc.data();
      const contactName = contactData && contactData.name ? contactData.name : targetPhoneNumber;
      
      window.showCallInterface && window.showCallInterface(contactName, targetPhoneNumber, false);
      
      window.updateCallDisplay && window.updateCallDisplay(callId, 'waiting');
      
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
          text: `📞 Appel en cours vers ${targetPhoneNumber}...`,
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
          window.updateCallDisplay && window.updateCallDisplay(callId, 'connected');
        }
      });
      
      onChildAdded(ref(database, `calls/${callId}/candidates/answerer`), async snapshot => {
        const candidate = new RTCIceCandidate(snapshot.val());
        await peerConnection.addIceCandidate(candidate);
      });
      
      hangupBtn.disabled = false;
      displayContacts();
    } catch (error) {
      console.error("Erreur lors de l'initiation de l'appel :", error);
      callBtn.disabled = false;
      alert("Erreur lors de l'initiation de l'appel. Vérifiez vos permissions audio.");
    }
  }
  
  async function answerIncomingCall(callIdIncoming, callData) {
    try {
      callInitiator = false;
      callId = callIdIncoming;
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
      
      window.updateCallDisplay && window.updateCallDisplay(callIdIncoming, 'connected');
      
      onChildAdded(ref(database, `calls/${callIdIncoming}/candidates/caller`), async snapshot => {
        const candidate = new RTCIceCandidate(snapshot.val());
        await peerConnection.addIceCandidate(candidate);
      });
      
      if (conversationRef) {
        push(conversationRef, {
          from: "Système",
          text: `📞 Appel connecté avec ${callData.from}`,
          timestamp: Date.now(),
          dateFormatted: getFormattedDate()
        });
      }
      
      hangupBtn.disabled = false;
      
      // Ouvrir automatiquement la page de chat
      activeChatTarget = callData.from;
      document.getElementById("contacts-page").style.display = "none";
      document.getElementById("chat-page").style.display = "block";
      loadChatForContact(activeChatTarget);
      
      displayContacts();
    } catch (error) {
      console.error("Erreur lors de la réponse à l'appel entrant :", error);
      alert("Erreur lors de la réponse à l'appel. Vérifiez vos permissions audio.");
    }
  }
  
  // Exposer la fonction answerCall globalement
  window.answerCall = () => {
    // Cette fonction sera appelée par l'interface d'appel
    console.log("Réponse à l'appel depuis l'interface");
  };
  
  // ===================== Gestion des appels entrants =====================
  const callsRef = ref(database, "calls");
  onChildAdded(callsRef, async snapshot => {
    const callData = snapshot.val();
    const currentCallId = snapshot.key;
    
    if (callData.target === myPhoneNumber && callData.status === 'waiting') {
      playNotificationSound();
      
      // Obtenir les informations du contact
      const contactDoc = await getDoc(doc(firestore, "users", callData.from));
      const contactData = contactDoc.data();
      const contactName = contactData && contactData.name ? contactData.name : callData.from;
      
      // Afficher l'interface d'appel
      window.showCallInterface && window.showCallInterface(contactName, callData.from, true);
      
      // Configurer le bouton de réponse
      window.answerCall = () => {
        answerIncomingCall(currentCallId, callData);
      };
      
      // Auto-rejet après 30 secondes
      setTimeout(() => {
        if (callData.status === 'waiting') {
          set(ref(database, `calls/${currentCallId}/status`), 'missed');
          window.hideCallInterface && window.hideCallInterface();
        }
      }, 30000);
    }
  });
  
  // ===================== Événements des boutons d'appel =====================
  
  callBtn.addEventListener("click", async () => {
    if (!activeChatTarget) {
      alert("Veuillez d'abord sélectionner un contact pour l'appeler.");
      return;
    }
    
    const contactDoc = await getDoc(doc(firestore, "users", activeChatTarget));
    const contactData = contactDoc.data();
    const contactName = contactData && contactData.name ? contactData.name : activeChatTarget;
    
    if (confirm(`📞 Appeler ${contactName} ?`)) {
      await initiateCallTo(activeChatTarget);
    }
  });
  
  answerBtn.addEventListener("click", async () => {
    const promptCallId = prompt("Entrez l'ID de l'appel pour répondre :");
    if (!promptCallId) return;
    
    const callSnapshot = await get(ref(database, `calls/${promptCallId}`));
    const callData = callSnapshot.val();
    
    if (!callData || !callData.offer) {
      alert("Appel non trouvé ou déjà terminé.");
      return;
    }
    await answerIncomingCall(promptCallId, callData);
  });
  
  hangupBtn.addEventListener("click", () => {
    if (confirm("Terminer l'appel en cours ?")) {
      endCall();
    }
  });
  
  // ===================== Gestion des statuts d'appel =====================
  const callStatusRef = ref(database, "calls");
  onChildAdded(callStatusRef, snapshot => {
    const callData = snapshot.val();
    const currentCallId = snapshot.key;
    
    if (callData.from === myPhoneNumber && callData.status === 'connected') {
      window.updateCallDisplay && window.updateCallDisplay(currentCallId, 'connected');
    }
    
    if (callData.from === myPhoneNumber && callData.status === 'rejected') {
      alert("Appel rejeté par le destinataire.");
      endCall();
    }
    
    if (callData.from === myPhoneNumber && callData.status === 'ended') {
      endCall();
    }
  });
  
  // ===================== Fonctions utilitaires =====================
  
  async function getContactName(phoneNumber) {
    try {
      const contactDoc = await getDoc(doc(firestore, "users", phoneNumber));
      const contactData = contactDoc.data();
      return contactData && contactData.name ? contactData.name : phoneNumber;
    } catch (error) {
      console.error("Erreur lors de la récupération du nom du contact:", error);
      return phoneNumber;
    }
  }
  
  function updateCallButtonState() {
    if (callBtn) {
      if (activeChatTarget && !callId) {
        callBtn.disabled = false;
        callBtn.title = `Appeler ${activeChatTarget}`;
      } else {
        callBtn.disabled = true;
        callBtn.title = activeChatTarget ? "Appel en cours..." : "Sélectionnez un contact";
      }
    }
  }
  
  setInterval(updateCallButtonState, 1000);
  
  // ===================== Nettoyage automatique =====================
  
  function cleanupOldCalls() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    get(ref(database, "calls")).then(snapshot => {
      const calls = snapshot.val() || {};
      
      Object.keys(calls).forEach(callId => {
        const callData = calls[callId];
        if (callData.timestamp < oneHourAgo) {
          remove(ref(database, `calls/${callId}`));
        }
      });
    }).catch(console.error);
  }
  
  setInterval(cleanupOldCalls, 30 * 60 * 1000);
  
  // ===================== Notifications système =====================
  
  function sendSystemNotification(title, body) {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: './favicon.png'
      });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, {
            body: body,
            icon: './favicon.png'
          });
        }
      });
    }
  }
  
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  
  // ===================== Mise à jour périodique des contacts =====================
  
  // Mettre à jour la liste des contacts toutes les 30 secondes
  setInterval(displayContacts, 30000);
  
  // ===================== Finalisation =====================
  
  // Appel initial : afficher la liste des contacts
  displayContacts();
  updateCallButtonState();
  
  console.log("🚀 Application WhatsApp initialisée avec succès!");
  console.log(`📱 Votre numéro: ${myPhoneNumber}`);
  
})();