// ===================== WHATSAPP WEB - JAVASCRIPT COMPLET =====================
console.log('je suis ici');
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

// ===================== CLASSE PRINCIPALE WHATSAPP =====================

class WhatsAppEnhanced {
  constructor() {
    // Initialisation Firebase
    this.app = initializeApp(firebaseConfig);
    this.database = getDatabase(this.app);
    this.firestore = getFirestore(this.app);
    
    // Variables d'état
    this.myPhoneNumber = null;
    this.activeChatTarget = null;
    this.conversationRef = null;
    this.conversationListener = null;
    this.deletionMode = false;
    this.contactsData = new Map();
    this.lastMessages = new Map();
    this.isTyping = false;
    this.typingTimeout = null;
    
    // WebRTC
    this.localStream = null;
    this.peerConnection = null;
    this.callId = null;
    this.callInitiator = false;
    this.callInterval = null;
    
    // Audio
    this.mediaRecorder = null;
    this.audioChunks = [];
    
    // Configuration WebRTC
    this.rtcServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    // Auto-initialisation
    this.init();
  }

  // ===================== INITIALISATION =====================
  
  async init() {
    try {
      console.log('🚀 Initialisation de WhatsApp Enhanced...');
      
      await this.setupUser();
      this.setupEventListeners();
      this.setupAudioRecording();
      await this.displayContacts();
      this.setupNotifications();
      this.setupPeriodicUpdates();
      this.setupIncomingCallListener();
      this.addCustomStyles();
      
      console.log('✅ WhatsApp Enhanced initialisé avec succès!');
      console.log(`📱 Votre numéro: ${this.myPhoneNumber}`);
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation:', error);
      this.showError('Erreur de connexion. Veuillez recharger la page.');
    }
  }

  // ===================== GESTION UTILISATEUR =====================
  
  async setupUser() {
    // Générer ou récupérer le numéro de téléphone
    this.myPhoneNumber = localStorage.getItem("myPhoneNumber");
    if (!this.myPhoneNumber) {
      this.myPhoneNumber = this.generatePhoneNumber();
      localStorage.setItem("myPhoneNumber", this.myPhoneNumber);
    }
    
    // Enregistrer l'utilisateur dans Firestore
    await setDoc(doc(this.firestore, "users", this.myPhoneNumber), { 
      phone: this.myPhoneNumber, 
      lastOnline: Date.now(),
      isOnline: true 
    }, { merge: true });
    
    // Afficher le numéro dans l'interface
    await this.updateUserDisplay();
    
    // Maintenir le statut en ligne
    this.maintainOnlineStatus();
  }

  generatePhoneNumber() {
    const prefix = Math.random() < 0.5 ? "06" : "07";
    let number = prefix;
    for (let i = 0; i < 8; i++) {
      number += Math.floor(Math.random() * 10);
    }
    return number;
  }

  async updateUserDisplay() {
    try {
      const currentUserDoc = await getDoc(doc(this.firestore, "users", this.myPhoneNumber));
      const currentUserData = currentUserDoc.data();
      const myName = currentUserData?.name || "";
      
      const userNameElement = document.getElementById("user-name");
      if (userNameElement) {
        userNameElement.textContent = myName || `Votre numéro: ${this.myPhoneNumber}`;
      }
    } catch (error) {
      console.error('Erreur mise à jour affichage utilisateur:', error);
    }
  }

  maintainOnlineStatus() {
    // Mettre à jour le statut toutes les 30 secondes
    setInterval(async () => {
      try {
        await setDoc(doc(this.firestore, "users", this.myPhoneNumber), { 
          lastOnline: Date.now(),
          isOnline: true 
        }, { merge: true });
      } catch (error) {
        console.error('Erreur mise à jour statut:', error);
      }
    }, 30000);

    // Marquer comme hors ligne lors de la fermeture
    window.addEventListener('beforeunload', async () => {
      try {
        await setDoc(doc(this.firestore, "users", this.myPhoneNumber), { 
          lastOnline: Date.now(),
          isOnline: false 
        }, { merge: true });
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
      }
    });
  }

  // ===================== GESTION DES ÉVÉNEMENTS =====================
  
  setupEventListeners() {
    // Boutons principaux
    this.setupMainButtons();
    
    // Zone de saisie
    this.setupInputArea();
    
    // Médias
    this.setupMediaHandlers();
    
    // Appels
    this.setupCallHandlers();
    
    // Recherche
    this.setupSearch();
    
    // Gestion mobile
    this.setupMobileHandlers();
  }

  setupMainButtons() {
    // Bouton retour
    const backButton = document.getElementById("back-button");
    if (backButton) {
      backButton.addEventListener("click", () => this.goBackToContacts());
    }

    // Bouton modification nom
    const addNameBtn = document.getElementById("add-name-btn");
    if (addNameBtn) {
      addNameBtn.addEventListener("click", () => this.editUserName());
    }

    // Bouton mode suppression
    const deleteModeBtn = document.getElementById("delete-mode-btn");
    if (deleteModeBtn) {
      deleteModeBtn.addEventListener("click", () => this.toggleDeletionMode());
    }
  }

  setupInputArea() {
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");

    if (chatInput) {
      // Envoi avec Enter
      chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Indicateur de frappe
      chatInput.addEventListener("input", () => this.handleTyping());
      chatInput.addEventListener("focus", () => this.handleTyping());
      chatInput.addEventListener("blur", () => this.stopTyping());
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", () => this.sendMessage());
    }
  }

  setupMediaHandlers() {
    const imageInput = document.getElementById("image-input");
    const videoInput = document.getElementById("video-input");

    if (imageInput) {
      imageInput.addEventListener("change", (e) => this.handleFileUpload(e, 'image'));
    }

    if (videoInput) {
      videoInput.addEventListener("change", (e) => this.handleFileUpload(e, 'video'));
    }
  }

  setupCallHandlers() {
    const callBtn = document.getElementById("call-btn");
    const answerBtn = document.getElementById("answer-btn");
    const hangupBtn = document.getElementById("hangup-btn");
    const copyCallIdBtn = document.getElementById("copy-call-id");

    if (callBtn) {
      callBtn.addEventListener("click", () => this.initiateCall());
    }

    if (answerBtn) {
      answerBtn.addEventListener("click", () => this.answerCall());
    }

    if (hangupBtn) {
      hangupBtn.addEventListener("click", () => this.endCall());
    }

    if (copyCallIdBtn) {
      copyCallIdBtn.addEventListener("click", () => this.copyCallId());
    }
  }

  setupSearch() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => this.filterContacts(e.target.value));
    }
  }

  setupMobileHandlers() {
    // Gestion responsive pour mobile
    this.checkMobile();
    window.addEventListener('resize', () => this.checkMobile());
  }

  // ===================== GESTION DES CONTACTS =====================
  
  async displayContacts() {
    try {
      const phoneList = document.getElementById("phone-list");
      if (!phoneList) return;

      phoneList.innerHTML = "";
      
      // Obtenir les notifications
      const notifications = await this.getNotifications();
      
      // Obtenir tous les utilisateurs
      const usersSnapshot = await getDocs(collection(this.firestore, "users"));
      const contactPromises = [];
      
      usersSnapshot.forEach(docSnapshot => {
        const contactNumber = docSnapshot.id;
        if (contactNumber !== this.myPhoneNumber) {
          contactPromises.push(this.createContactItem(contactNumber, docSnapshot.data(), notifications[contactNumber] || 0));
        }
      });
      
      // Attendre tous les contacts
      const contactElements = await Promise.all(contactPromises);
      
      // Trier par dernière activité
      contactElements.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      
      // Ajouter à la liste
      contactElements.forEach(contactData => {
        if (contactData.element) {
          phoneList.appendChild(contactData.element);
        }
      });

    } catch (error) {
      console.error('Erreur affichage contacts:', error);
      this.showError('Erreur lors du chargement des contacts');
    }
  }

  async createContactItem(contactNumber, contactData, unreadCount) {
    const contactName = contactData.name || contactNumber;
    const isOnline = contactData.isOnline || false;
    const lastOnline = contactData.lastOnline || 0;
    
    // Récupérer le dernier message
    const lastMessage = await this.getLastMessage(contactNumber);
    
    // Déterminer le statut du message
    let messageStatus = null;
    if (lastMessage && lastMessage.from === this.myPhoneNumber) {
      if (lastMessage.read) {
        messageStatus = 'read';
      } else if (lastMessage.delivered) {
        messageStatus = 'delivered';
      } else {
        messageStatus = 'sent';
      }
    }
    
    // Créer l'élément
    const contactElement = this.createContactElement({
      number: contactNumber,
      name: contactName,
      lastMessage: lastMessage ? this.getMessagePreview(lastMessage) : 'Nouveau contact',
      time: lastMessage ? this.getRelativeTime(lastMessage.timestamp) : this.getRelativeTime(lastOnline),
      unreadCount: unreadCount,
      isOnline: isOnline,
      messageStatus: messageStatus
    });
    
    // Ajouter l'événement de clic
    contactElement.addEventListener("click", () => this.handleContactClick(contactNumber, contactElement));
    
    return {
      element: contactElement,
      lastMessageTime: lastMessage ? lastMessage.timestamp : 0
    };
  }

  createContactElement(data) {
    const { number, name, lastMessage, time, unreadCount, isOnline, messageStatus } = data;
    
    const contactItem = document.createElement("div");
    contactItem.classList.add("contact-item");
    if (isOnline) contactItem.classList.add("online");
    contactItem.dataset.contactId = number;
    contactItem.dataset.name = name.toLowerCase();
    
    // Avatar
    const avatar = document.createElement("div");
    avatar.classList.add("contact-avatar");
    avatar.textContent = name.charAt(0).toUpperCase();
    
    // Informations
    const contactInfo = document.createElement("div");
    contactInfo.classList.add("contact-info");
    
    // Header
    const contactHeader = document.createElement("div");
    contactHeader.classList.add("contact-header");
    
    const contactName = document.createElement("div");
    contactName.classList.add("contact-name");
    contactName.textContent = name;
    
    const contactTime = document.createElement("div");
    contactTime.classList.add("contact-time");
    contactTime.textContent = time;
    
    contactHeader.appendChild(contactName);
    contactHeader.appendChild(contactTime);
    
    // Ligne du message
    const messageLine = document.createElement("div");
    messageLine.classList.add("contact-message-line");
    
    // Statut du message
    if (messageStatus) {
      const statusIcon = document.createElement("div");
      statusIcon.classList.add("message-status", messageStatus);
      
      switch (messageStatus) {
        case 'sent': statusIcon.textContent = '✓'; break;
        case 'delivered': statusIcon.textContent = '✓✓'; break;
        case 'read': statusIcon.textContent = '✓✓'; break;
      }
      
      messageLine.appendChild(statusIcon);
    }
    
    // Dernier message
    const lastMsg = document.createElement("div");
    lastMsg.classList.add("contact-last-message");
    lastMsg.textContent = lastMessage;
    messageLine.appendChild(lastMsg);
    
    // Badge de notification
    if (unreadCount > 0) {
      const badge = document.createElement("div");
      badge.classList.add("notification-badge");
      badge.textContent = unreadCount;
      messageLine.appendChild(badge);
    }
    
    // Assemblage
    contactInfo.appendChild(contactHeader);
    contactInfo.appendChild(messageLine);
    contactItem.appendChild(avatar);
    contactItem.appendChild(contactInfo);
    
    return contactItem;
  }

  async handleContactClick(contactNumber, contactElement) {
    if (this.deletionMode) {
      await this.deleteContact(contactNumber);
    } else {
      this.selectContact(contactNumber, contactElement);
    }
  }

  selectContact(contactNumber, contactElement) {
    // Retirer la classe active de tous les contacts
    document.querySelectorAll('.contact-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Activer le contact sélectionné
    contactElement.classList.add('active');
    
    this.activeChatTarget = contactNumber;
    this.loadChatForContact(contactNumber);
  }

  async deleteContact(contactNumber) {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce contact ?")) {
      try {
        await deleteDoc(doc(this.firestore, "users", contactNumber));
        this.showSuccess("Contact supprimé !");
        this.toggleDeletionMode();
        await this.displayContacts();
      } catch (error) {
        console.error('Erreur suppression contact:', error);
        this.showError('Erreur lors de la suppression');
      }
    }
  }

  // ===================== GESTION DU CHAT =====================
  
  async loadChatForContact(contactNumber) {
    try {
      // Afficher la page de chat
      this.showChatPage();
      
      // Mettre à jour l'en-tête du chat
      await this.updateChatHeader(contactNumber);
      
      // Effacer les notifications
      this.clearNotificationsFor(contactNumber);
      
      // Charger la conversation
      this.loadConversation(contactNumber);
      
    } catch (error) {
      console.error('Erreur chargement chat:', error);
      this.showError('Erreur lors du chargement de la conversation');
    }
  }

  showChatPage() {
    document.getElementById("contacts-page").style.display = "none";
    document.getElementById("chat-page").style.display = "flex";
    
    // Animation d'entrée
    const chatPage = document.getElementById("chat-page");
    if (chatPage) {
      chatPage.style.transform = "translateX(100%)";
      setTimeout(() => {
        chatPage.style.transition = "transform 0.3s ease";
        chatPage.style.transform = "translateX(0)";
      }, 10);
    }
  }

  async updateChatHeader(contactNumber) {
    try {
      const contactDoc = await getDoc(doc(this.firestore, "users", contactNumber));
      const contactData = contactDoc.data();
      const contactName = contactData?.name || contactNumber;
      const isOnline = contactData?.isOnline || false;
      
      // Mettre à jour les éléments de l'en-tête
      const chatContactName = document.getElementById("chat-contact-name");
      const chatContactStatus = document.getElementById("chat-contact-status");
      const chatAvatar = document.getElementById("chat-avatar");
      
      if (chatContactName) chatContactName.textContent = contactName;
      if (chatContactStatus) chatContactStatus.textContent = isOnline ? "En ligne" : "Hors ligne";
      if (chatAvatar) chatAvatar.textContent = contactName.charAt(0).toUpperCase();
    } catch (error) {
      console.error('Erreur mise à jour en-tête chat:', error);
    }
  }

  loadConversation(contactNumber) {
    const convId = this.getConversationId(this.myPhoneNumber, contactNumber);
    
    // Nettoyer l'ancienne conversation
    if (this.conversationRef && this.conversationListener) {
      off(this.conversationRef, "child_added", this.conversationListener);
    }
    
    // Effacer la zone de chat
    const chatBox = document.getElementById("chat-box");
    if (chatBox) chatBox.innerHTML = "";
    
    // Configurer la nouvelle conversation
    this.conversationRef = ref(this.database, `chats/${convId}`);
    
    this.conversationListener = onChildAdded(this.conversationRef, (snapshot) => {
      this.handleNewMessage(snapshot);
    });
  }

  handleNewMessage(snapshot) {
    const data = snapshot.val();
    const messageId = snapshot.key;
    
    // Créer l'élément du message
    const messageElement = this.createMessageElement(data, messageId);
    
    // Ajouter à la zone de chat
    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
      chatBox.appendChild(messageElement);
      this.scrollToBottom(chatBox);
    }
    
    // Marquer comme lu si c'est un message reçu
    if (data.from !== this.myPhoneNumber && !data.read) {
      setTimeout(() => this.markMessageAsRead(messageId), 1000);
    }
    
    // Jouer le son de notification
    this.playNotificationSound();
  }

  createMessageElement(data, messageId) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", data.from === this.myPhoneNumber ? "sent" : "received");
    messageElement.setAttribute("data-id", messageId);
    
    // Contenu du message
    if (data.text) {
      const textDiv = document.createElement("div");
      textDiv.textContent = data.text;
      messageElement.appendChild(textDiv);
    } else if (data.image) {
      const img = document.createElement("img");
      img.src = data.image;
      img.alt = "Image";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "12px";
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
    
    // Timestamp
    const timestamp = document.createElement("span");
    timestamp.classList.add("timestamp");
    timestamp.textContent = data.dateFormatted || this.getFormattedDate();
    
    // Statut pour les messages envoyés
    if (data.from === this.myPhoneNumber) {
      this.updateMessageStatus(messageElement, data);
    }
    
    messageElement.appendChild(timestamp);
    
    // Bouton de suppression
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.classList.add("delete-btn");
    deleteBtn.onclick = () => this.deleteMessage(messageId);
    messageElement.appendChild(deleteBtn);
    
    return messageElement;
  }

  sendMessage() {
    const chatInput = document.getElementById("chat-input");
    if (!chatInput || !this.conversationRef) return;
    
    const message = chatInput.value.trim();
    if (message === "") return;
    
    // Envoyer le message
    push(this.conversationRef, {
      from: this.myPhoneNumber,
      to: this.activeChatTarget,
      text: message,
      timestamp: Date.now(),
      dateFormatted: this.getFormattedDate(),
      sent: true,
      delivered: false,
      read: false
    });
    
    // Ajouter notification
    this.addNotification(this.activeChatTarget);
    
    // Effacer l'input
    chatInput.value = "";
    this.stopTyping();
  }

  async handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file || !this.conversationRef) return;
    
    // Vérifier la taille du fichier (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      this.showError('Fichier trop volumineux (5MB maximum)');
      return;
    }
    
    // Afficher un indicateur de chargement
    this.showLoading('Envoi en cours...');
    
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const messageData = {
          from: this.myPhoneNumber,
          to: this.activeChatTarget,
          timestamp: Date.now(),
          dateFormatted: this.getFormattedDate(),
          sent: true,
          delivered: false,
          read: false
        };
        
        messageData[type] = reader.result;
        
        push(this.conversationRef, messageData);
        this.addNotification(this.activeChatTarget);
        this.hideLoading();
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erreur upload fichier:', error);
      this.showError('Erreur lors de l\'envoi du fichier');
      this.hideLoading();
    }
  }

  // ===================== AUDIO ET APPELS =====================
  
  async setupAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      
      this.mediaRecorder.ondataavailable = event => {
        this.audioChunks.push(event.data);
      };
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const reader = new FileReader();
        
        reader.onloadend = () => {
          if (this.conversationRef) {
            push(this.conversationRef, {
              from: this.myPhoneNumber,
              to: this.activeChatTarget,
              audio: reader.result,
              timestamp: Date.now(),
              dateFormatted: this.getFormattedDate(),
              sent: true,
              delivered: false,
              read: false
            });
            this.addNotification(this.activeChatTarget);
          }
        };
        
        reader.readAsDataURL(audioBlob);
        this.audioChunks = [];
      };
      
      // Configurer les boutons
      const recordBtn = document.getElementById("record-btn");
      const stopBtn = document.getElementById("stop-btn");
      
      if (recordBtn) {
        recordBtn.addEventListener("click", () => {
          this.mediaRecorder.start();
          recordBtn.disabled = true;
          stopBtn.disabled = false;
          this.showRecording();
        });
      }
      
      if (stopBtn) {
        stopBtn.addEventListener("click", () => {
          this.mediaRecorder.stop();
          recordBtn.disabled = false;
          stopBtn.disabled = true;
          this.hideRecording();
        });
      }
      
    } catch (error) {
      console.error('Erreur configuration audio:', error);
    }
  }

  async initiateCall() {
    if (!this.activeChatTarget) {
      this.showError("Veuillez sélectionner un contact");
      return;
    }
    
    try {
      this.callInitiator = true;
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.callId = this.generateCallId();
      
      // Afficher l'interface d'appel
      const contactDoc = await getDoc(doc(this.firestore, "users", this.activeChatTarget));
      const contactData = contactDoc.data();
      const contactName = contactData?.name || this.activeChatTarget;
      
      this.showCallInterface(contactName, this.activeChatTarget, false);
      
      // Initialiser WebRTC
      this.initPeerConnection();
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      // Enregistrer l'appel
      await set(ref(this.database, `calls/${this.callId}`), {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        status: 'waiting',
        from: this.myPhoneNumber,
        target: this.activeChatTarget,
        timestamp: Date.now()
      });
      
      // Écouter la réponse
      this.listenForCallAnswer();
      
    } catch (error) {
      console.error('Erreur initiation appel:', error);
      this.showError('Erreur lors de l\'appel');
    }
  }

  initPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.rtcServers);
    
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });
    
    this.peerConnection.ontrack = event => {
      const remoteAudio = document.getElementById("remote-audio");
      if (remoteAudio) {
        remoteAudio.srcObject = event.streams[0];
      }
    };
    
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        const candidatesRef = this.callInitiator ? 
          ref(this.database, `calls/${this.callId}/candidates/caller`) :
          ref(this.database, `calls/${this.callId}/candidates/answerer`);
        push(candidatesRef, event.candidate.toJSON());
      }
    };
  }

  endCall() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.callId) {
      set(ref(this.database, `calls/${this.callId}/status`), 'ended');
    }
    
    if (this.callInterval) {
      clearInterval(this.callInterval);
      this.callInterval = null;
    }
    
    this.hideCallInterface();
    this.callId = null;
    this.updateCallButtons();
  }

  // ===================== UTILITAIRES =====================
  
  getConversationId(phoneA, phoneB) {
    return [phoneA, phoneB].sort().join("_");
  }

  getFormattedDate() {
    return new Date().toLocaleString("fr-FR", { 
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'maintenant';
    if (minutes < 60) return `${minutes}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}j`;
    
    return new Date(timestamp).toLocaleDateString("fr-FR", { 
      day: "2-digit", 
      month: "2-digit" 
    });
  }

  getMessagePreview(message) {
    if (message.text) return message.text;
    if (message.image) return '📷 Image';
    if (message.audio) return '🎵 Audio';
    if (message.video) return '📹 Vidéo';
    return 'Message';
  }

  generateCallId() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  // ===================== NOTIFICATIONS ET FEEDBACK =====================
  
  async getNotifications() {
    try {
      const notifRef = ref(this.database, `notifications/${this.myPhoneNumber}`);
      const snapshot = await get(notifRef);
      const notifications = snapshot.val() || {};
      const grouped = {};
      
      Object.values(notifications).forEach(notif => {
        if (notif.from) {
          grouped[notif.from] = (grouped[notif.from] || 0) + 1;
        }
      });
      
      return grouped;
    } catch (error) {
      console.error('Erreur notifications:', error);
      return {};
    }
  }

  addNotification(recipient) {
    const notifRef = ref(this.database, `notifications/${recipient}`);
    push(notifRef, {
      from: this.myPhoneNumber,
      timestamp: Date.now()
    });
  }

  clearNotificationsFor(contact) {
    const notifRef = ref(this.database, `notifications/${this.myPhoneNumber}`);
    get(notifRef).then(snapshot => {
      const notifs = snapshot.val();
      if (notifs) {
        Object.keys(notifs).forEach(key => {
          if (notifs[key].from === contact) {
            remove(ref(this.database, `notifications/${this.myPhoneNumber}/${key}`));
          }
        });
      }
    });
  }

  setupNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Badge d'application
    const notifRef = ref(this.database, `notifications/${this.myPhoneNumber}`);
    onValue(notifRef, (snapshot) => {
      const notifications = snapshot.val() || {};
      const count = Object.keys(notifications).length;
      
      if (navigator.setAppBadge) {
        navigator.setAppBadge(count);
      } else {
        document.title = count ? `(${count}) WhatsApp Web` : "WhatsApp Web";
      }
    });
  }

  playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('Notification audio non disponible');
    }
  }

  sendSystemNotification(title, body) {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: './favicon.png',
        vibrate: [200, 100, 200]
      });
    }
  }

  // ===================== FONCTIONS D'INTERFACE =====================
  
  showCallInterface(contactName, contactNumber, isIncoming = true) {
    const overlay = document.getElementById('call-overlay');
    const statusText = document.getElementById('call-status-text');
    const nameElement = document.getElementById('call-contact-name');
    const numberElement = document.getElementById('call-contact-number');
    const avatarElement = document.getElementById('call-avatar-large');
    const answerBtn = document.getElementById('answer-call-btn');
    const declineBtn = document.getElementById('decline-call-btn');
    
    if (!overlay) return;
    
    overlay.classList.add('active');
    if (nameElement) nameElement.textContent = contactName;
    if (numberElement) numberElement.textContent = contactNumber;
    if (avatarElement) avatarElement.textContent = contactName.charAt(0);
    
    if (isIncoming) {
      if (statusText) statusText.textContent = 'Appel entrant...';
      if (answerBtn) answerBtn.style.display = 'flex';
    } else {
      if (statusText) statusText.textContent = 'Appel en cours...';
      if (answerBtn) answerBtn.style.display = 'none';
    }
    
    // Démarrer le timer
    let duration = 0;
    const durationElement = document.getElementById('call-duration');
    this.callInterval = setInterval(() => {
      duration++;
      const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
      const seconds = (duration % 60).toString().padStart(2, '0');
      if (durationElement) durationElement.textContent = `${minutes}:${seconds}`;
    }, 1000);
    
    // Gestion des boutons
    if (declineBtn) {
      declineBtn.onclick = () => this.endCall();
    }
  }

  hideCallInterface() {
    const overlay = document.getElementById('call-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
    
    if (this.callInterval) {
      clearInterval(this.callInterval);
      this.callInterval = null;
    }
  }

  goBackToContacts() {
    // Nettoyer la conversation
    if (this.conversationRef && this.conversationListener) {
      off(this.conversationRef, "child_added", this.conversationListener);
    }
    
    // Réinitialiser les variables
    this.activeChatTarget = null;
    this.conversationRef = null;
    this.conversationListener = null;
    
    // Afficher la page des contacts
    document.getElementById("chat-page").style.display = "none";
    document.getElementById("contacts-page").style.display = "flex";
    
    // Rafraîchir la liste des contacts
    this.displayContacts();
  }

  async editUserName() {
    try {
      const currentUserDoc = await getDoc(doc(this.firestore, "users", this.myPhoneNumber));
      const currentUserData = currentUserDoc.data();
      const currentName = currentUserData?.name || "";
      
      const newName = prompt("Entrez votre nom :", currentName);
      if (newName && newName.trim() !== "") {
        await setDoc(doc(this.firestore, "users", this.myPhoneNumber), { 
          name: newName.trim() 
        }, { merge: true });
        
        this.showSuccess("Nom mis à jour !");
        await this.updateUserDisplay();
        await this.displayContacts();
      }
    } catch (error) {
      console.error('Erreur mise à jour nom:', error);
      this.showError('Erreur lors de la mise à jour');
    }
  }

  toggleDeletionMode() {
    this.deletionMode = !this.deletionMode;
    const deleteModeBtn = document.getElementById("delete-mode-btn");
    
    if (deleteModeBtn) {
      if (this.deletionMode) {
        deleteModeBtn.classList.add('active');
        this.showInfo("Mode suppression activé. Cliquez sur un contact pour le supprimer.");
      } else {
        deleteModeBtn.classList.remove('active');
      }
    }
  }

  filterContacts(searchTerm) {
    const contacts = document.querySelectorAll('.contact-item');
    const term = searchTerm.toLowerCase();
    
    contacts.forEach(contact => {
      const name = contact.dataset.name || '';
      const number = contact.dataset.contactId || '';
      
      if (name.includes(term) || number.includes(term)) {
        contact.style.display = 'flex';
      } else {
        contact.style.display = 'none';
      }
    });
  }

  checkMobile() {
    const isMobile = window.innerWidth <= 768;
    const contactsPage = document.getElementById("contacts-page");
    
    if (isMobile) {
      // Logique mobile
      if (this.activeChatTarget) {
        if (contactsPage) contactsPage.classList.add('hidden');
      } else {
        if (contactsPage) contactsPage.classList.remove('hidden');
      }
    } else {
      // Logique desktop
      if (contactsPage) contactsPage.classList.remove('hidden');
    }
  }

  // ===================== GESTION DES STATUTS DE MESSAGES =====================
  
  async getLastMessage(contactNumber) {
    const convId = this.getConversationId(this.myPhoneNumber, contactNumber);
    const messagesRef = ref(this.database, `chats/${convId}`);
    
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
          ...messageData
        };
      }
    } catch (error) {
      console.error("Erreur récupération dernier message:", error);
    }
    
    return null;
  }

  markMessageAsRead(messageId) {
    if (!this.conversationRef) return;
    
    const messageRef = ref(this.database, `${this.conversationRef.toString()}/${messageId}`);
    set(messageRef, { read: true }, { merge: true }).catch(console.error);
  }

  updateMessageStatus(messageElement, data) {
    const timestamp = messageElement.querySelector('.timestamp');
    if (!timestamp) return;
    
    // Supprimer l'ancien indicateur
    const oldIndicator = timestamp.querySelector('.message-status-indicator');
    if (oldIndicator) oldIndicator.remove();
    
    // Ajouter le nouvel indicateur
    const statusIndicator = document.createElement('span');
    statusIndicator.classList.add('message-status-indicator');
    
    let status = 'sent';
    if (data.read) {
      status = 'read';
      statusIndicator.textContent = '✓✓';
      statusIndicator.style.color = '#25d366';
    } else if (data.delivered) {
      status = 'delivered';
      statusIndicator.textContent = '✓✓';
      statusIndicator.style.color = '#8696a0';
    } else {
      statusIndicator.textContent = '✓';
      statusIndicator.style.color = '#8696a0';
    }
    
    statusIndicator.classList.add(status);
    timestamp.appendChild(statusIndicator);
  }

  deleteMessage(messageId) {
    if (!this.conversationRef) return;
    
    if (confirm('Supprimer ce message ?')) {
      const messageRef = ref(this.database, `${this.conversationRef.toString()}/${messageId}`);
      remove(messageRef)
        .then(() => {
          const messageElement = document.querySelector(`[data-id='${messageId}']`);
          if (messageElement) {
            messageElement.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => messageElement.remove(), 300);
          }
        })
        .catch(error => {
          console.error('Erreur suppression message:', error);
          this.showError('Erreur lors de la suppression');
        });
    }
  }

  // ===================== GESTION DE LA FRAPPE =====================
  
  handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      this.showTypingIndicator();
    }
    
    // Reset le timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 2000);
  }

  stopTyping() {
    this.isTyping = false;
    this.hideTypingIndicator();
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.style.display = 'flex';
    }
  }

  hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  // ===================== AUTRES FONCTIONNALITÉS =====================
  
  showRecording() {
    this.showInfo('🎙️ Enregistrement en cours...');
  }

  hideRecording() {
    this.showSuccess('✅ Enregistrement terminé');
  }

  copyCallId() {
    const callIdElement = document.getElementById('current-call-id');
    if (callIdElement) {
      navigator.clipboard.writeText(callIdElement.textContent)
        .then(() => this.showSuccess('ID d\'appel copié !'))
        .catch(() => this.showError('Erreur lors de la copie'));
    }
  }

  answerCall() {
    const promptCallId = prompt("Entrez l'ID de l'appel pour répondre :");
    if (!promptCallId) return;
    
    get(ref(this.database, `calls/${promptCallId}`)).then(async (snapshot) => {
      const callData = snapshot.val();
      
      if (!callData || !callData.offer) {
        this.showError("Appel non trouvé ou déjà terminé.");
        return;
      }
      
      try {
        this.callInitiator = false;
        this.callId = promptCallId;
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.initPeerConnection();
        
        const offerDescription = new RTCSessionDescription(callData.offer);
        await this.peerConnection.setRemoteDescription(offerDescription);
        const answerDescription = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answerDescription);
        
        await set(ref(this.database, `calls/${promptCallId}/answer`), {
          type: answerDescription.type,
          sdp: answerDescription.sdp
        });
        
        await set(ref(this.database, `calls/${promptCallId}/status`), 'connected');
        this.updateCallButtons();
        
      } catch (error) {
        console.error('Erreur réponse appel:', error);
        this.showError('Erreur lors de la réponse à l\'appel');
      }
    });
  }

  listenForCallAnswer() {
    if (!this.callId) return;
    
    onValue(ref(this.database, `calls/${this.callId}/answer`), async (snapshot) => {
      const answer = snapshot.val();
      if (answer && !this.peerConnection.currentRemoteDescription) {
        try {
          const answerDescription = new RTCSessionDescription(answer);
          await this.peerConnection.setRemoteDescription(answerDescription);
          this.updateCallButtons();
        } catch (error) {
          console.error('Erreur traitement réponse:', error);
        }
      }
    });
    
    // Écouter les candidats ICE
    onChildAdded(ref(this.database, `calls/${this.callId}/candidates/answerer`), async (snapshot) => {
      try {
        const candidate = new RTCIceCandidate(snapshot.val());
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Erreur ICE candidate:', error);
      }
    });
  }

  updateCallButtons() {
    const callBtn = document.getElementById('call-btn');
    const hangupBtn = document.getElementById('hangup-btn');
    
    if (callBtn) {
      callBtn.disabled = !!this.callId;
    }
    
    if (hangupBtn) {
      hangupBtn.disabled = !this.callId;
    }
  }

  // ===================== FONCTIONS D'AFFICHAGE DES MESSAGES =====================
  
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showInfo(message) {
    this.showNotification(message, 'info');
  }

  showLoading(message) {
    this.showNotification(message, 'loading');
  }

  hideLoading() {
    const existingNotif = document.querySelector('.notification.loading');
    if (existingNotif) {
      existingNotif.remove();
    }
  }

  showNotification(message, type = 'info') {
    // Supprimer les notifications existantes du même type
    const existing = document.querySelectorAll(`.notification.${type}`);
    existing.forEach(notif => notif.remove());
    
    const notification = document.createElement('div');
    notification.classList.add('notification', type);
    
    let icon = '';
    let bgColor = '';
    
    switch (type) {
      case 'success':
        icon = '✅';
        bgColor = '#25d366';
        break;
      case 'error':
        icon = '❌';
        bgColor = '#e53e3e';
        break;
      case 'info':
        icon = 'ℹ️';
        bgColor = '#3b82f6';
        break;
      case 'loading':
        icon = '⏳';
        bgColor = '#8696a0';
        break;
    }
    
    notification.innerHTML = `
      <span style="margin-right: 8px;">${icon}</span>
      <span>${message}</span>
    `;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: 500;
      z-index: 2000;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
      animation: slideInFromRight 0.3s ease, fadeOut 0.3s ease ${type === 'loading' ? 'infinite' : '2.7s'} forwards;
      display: flex;
      align-items: center;
      max-width: 300px;
      word-wrap: break-word;
    `;
    
    document.body.appendChild(notification);
    
    if (type !== 'loading') {
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 3000);
    }
  }

  // ===================== MISES À JOUR PÉRIODIQUES =====================
  
  setupPeriodicUpdates() {
    // Mettre à jour les contacts toutes les 30 secondes
    setInterval(() => {
      if (!this.activeChatTarget) {
        this.displayContacts();
      }
    }, 30000);
    
    // Nettoyer les anciens appels toutes les 10 minutes
    setInterval(() => {
      this.cleanupOldCalls();
    }, 10 * 60 * 1000);
    
    // Mettre à jour les timestamps relatifs toutes les minute
    setInterval(() => {
      this.updateRelativeTimestamps();
    }, 60000);
  }

  cleanupOldCalls() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    get(ref(this.database, "calls")).then(snapshot => {
      const calls = snapshot.val() || {};
      
      Object.keys(calls).forEach(callId => {
        const callData = calls[callId];
        if (callData.timestamp < oneHourAgo && callData.status !== 'connected') {
          remove(ref(this.database, `calls/${callId}`)).catch(console.error);
        }
      });
    }).catch(console.error);
  }

  updateRelativeTimestamps() {
    const timeElements = document.querySelectorAll('.contact-time');
    timeElements.forEach(element => {
      const timestamp = element.dataset.timestamp;
      if (timestamp) {
        element.textContent = this.getRelativeTime(parseInt(timestamp));
      }
    });
  }

  // ===================== GESTION DES APPELS ENTRANTS =====================
  
  setupIncomingCallListener() {
    const callsRef = ref(this.database, "calls");
    onChildAdded(callsRef, async (snapshot) => {
      const callData = snapshot.val();
      const currentCallId = snapshot.key;
      
      if (callData.target === this.myPhoneNumber && callData.status === 'waiting') {
        this.playNotificationSound();
        
        // Obtenir les informations du contact
        const contactDoc = await getDoc(doc(this.firestore, "users", callData.from));
        const contactData = contactDoc.data();
        const contactName = contactData?.name || callData.from;
        
        // Afficher l'interface d'appel
        this.showCallInterface(contactName, callData.from, true);
        
        // Configurer les boutons de l'interface d'appel
        const answerBtn = document.getElementById('answer-call-btn');
        const declineBtn = document.getElementById('decline-call-btn');
        
        if (answerBtn) {
          answerBtn.onclick = () => {
            this.answerIncomingCall(currentCallId, callData);
          };
        }
        
        if (declineBtn) {
          declineBtn.onclick = () => {
            set(ref(this.database, `calls/${currentCallId}/status`), 'rejected');
            this.hideCallInterface();
          };
        }
        
        // Auto-rejet après 30 secondes
        setTimeout(() => {
          if (callData.status === 'waiting') {
            set(ref(this.database, `calls/${currentCallId}/status`), 'missed');
            this.hideCallInterface();
            this.sendSystemNotification('Appel manqué', `Appel manqué de ${contactName}`);
          }
        }, 30000);
      }
    });
  }

  async answerIncomingCall(callId, callData) {
    try {
      this.callInitiator = false;
      this.callId = callId;
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.initPeerConnection();
      
      const offerDescription = new RTCSessionDescription(callData.offer);
      await this.peerConnection.setRemoteDescription(offerDescription);
      const answerDescription = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answerDescription);
      
      await set(ref(this.database, `calls/${callId}/answer`), {
        type: answerDescription.type,
        sdp: answerDescription.sdp
      });
      
      await set(ref(this.database, `calls/${callId}/status`), 'connected');
      
      // Écouter les candidats ICE
      onChildAdded(ref(this.database, `calls/${callId}/candidates/caller`), async (snapshot) => {
        try {
          const candidate = new RTCIceCandidate(snapshot.val());
          await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
          console.error('Erreur ICE candidate:', error);
        }
      });
      
      // Ouvrir automatiquement la conversation
      if (callData.from !== this.activeChatTarget) {
        this.activeChatTarget = callData.from;
        this.loadChatForContact(callData.from);
      }
      
      this.updateCallButtons();
      this.showSuccess('Appel connecté');
      
    } catch (error) {
      console.error('Erreur réponse appel entrant:', error);
      this.showError('Erreur lors de la réponse à l\'appel');
    }
  }

  // ===================== ANIMATIONS CSS SUPPLÉMENTAIRES =====================
  
  addCustomStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Animations pour les notifications */
      @keyframes slideInFromRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes fadeOut {
        0%, 90% { opacity: 1; }
        100% { opacity: 0; transform: translateX(100%); }
      }
      
      /* Animation pour la suppression de message */
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; height: auto; }
        to { transform: translateX(-100%); opacity: 0; height: 0; margin: 0; padding: 0; }
      }
      
      /* Amélioration de l'accessibilité */
      .contact-item:focus,
      .chat-action-btn:focus,
      .action-btn:focus {
        outline: 2px solid #25d366;
        outline-offset: 2px;
      }
      
      /* États de chargement */
      .loading-skeleton {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: loading 1.5s infinite;
      }
      
      @keyframes loading {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      /* Amélioration du mode sombre */
      @media (prefers-color-scheme: dark) {
        .loading-skeleton {
          background: linear-gradient(90deg, #2a3942 25%, #3b4a54 50%, #2a3942 75%);
        }
      }
      
      /* Responsive amélioré */
      @media (max-width: 480px) {
        .notification {
          right: 10px !important;
          left: 10px !important;
          max-width: none !important;
        }
        
        .call-overlay .call-avatar-large {
          width: 180px !important;
          height: 180px !important;
          font-size: 70px !important;
        }
        
        .call-controls {
          gap: 30px !important;
        }
        
        .call-btn-large {
          width: 65px !important;
          height: 65px !important;
          font-size: 28px !important;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  // ===================== FINALISATION ET NETTOYAGE =====================
  
  destroy() {
    // Nettoyer les listeners
    if (this.conversationRef && this.conversationListener) {
      off(this.conversationRef, "child_added", this.conversationListener);
    }
    
    // Fermer les connexions WebRTC
    this.endCall();
    
    // Arrêter l'enregistrement audio
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    // Nettoyer les timeouts
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Marquer comme hors ligne
    setDoc(doc(this.firestore, "users", this.myPhoneNumber), { 
      lastOnline: Date.now(),
      isOnline: false 
    }, { merge: true }).catch(console.error);
  }
}

// ===================== INITIALISATION DE L'APPLICATION =====================

// Variables globales
let whatsappApp = null;

// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', function() {
  console.log('📱 Démarrage de WhatsApp Enhanced...');
  
  // Créer l'instance de l'application
  whatsappApp = new WhatsAppEnhanced();
  
  // Exposer l'instance globalement pour le débogage
  window.whatsappApp = whatsappApp;
  
  // Nettoyer lors de la fermeture de la page
  window.addEventListener('beforeunload', () => {
    if (whatsappApp) {
      whatsappApp.destroy();
    }
  });
});

// ===================== FONCTIONS GLOBALES POUR LA COMPATIBILITÉ =====================

// Ces fonctions sont appelées depuis l'HTML
window.showCallInterface = function(contactName, contactNumber, isIncoming = true) {
  if (whatsappApp) {
    return whatsappApp.showCallInterface(contactName, contactNumber, isIncoming);
  }
};

window.hideCallInterface = function() {
  if (whatsappApp) {
    whatsappApp.hideCallInterface();
  }
};

window.endCall = function() {
  if (whatsappApp) {
    whatsappApp.endCall();
  }
};

window.answerCall = function() {
  if (whatsappApp) {
    whatsappApp.answerCall();
  }
};

// Service Worker pour PWA (si nécessaire)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('✅ Service Worker enregistré:', registration.scope);
    })
    .catch(error => {
      console.log('ℹ️ Service Worker non disponible:', error);
    });
}

console.log('🎉 WhatsApp Enhanced - Fichier JavaScript chargé avec succès!');