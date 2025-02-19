import { getDatabase, ref, push, onChildAdded, remove, get, set, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

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

// 📌 Initialisation Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const chatRef = ref(database, "chat");
const callsRef = ref(database, "calls");

// 🛠️ Sélection des éléments HTML
const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const recordBtn = document.getElementById("record-btn");
const stopBtn = document.getElementById("stop-btn");
const imageInput = document.getElementById("image-input");
const callBtn = document.getElementById("call-btn");
const answerBtn = document.getElementById("answer-btn");
const remoteAudio = document.getElementById("remote-audio");
const hangupBtn = document.getElementById("hangup-btn");

// 🌐 Vérification des éléments HTML
if (!chatBox || !chatInput || !sendBtn || !recordBtn || !stopBtn || !imageInput || !callBtn || !answerBtn || !remoteAudio || !hangupBtn) {
    console.error("❌ ERREUR : Un ou plusieurs éléments HTML manquent !");
}

// 🔔 Ajouter un son de notification
const notificationSound = new Audio('phone_ring_tone.wav'); // Assurez-vous que le fichier est présent

// Fonction pour jouer le son de notification deux fois
function playNotificationSound() {
    notificationSound.play().catch((error) => {
        console.error("Erreur lors de la lecture du son de notification : ", error);
    });

    // Ajouter un délai de 1s avant de jouer à nouveau le son
    setTimeout(() => {
        notificationSound.play().catch((error) => {
            console.error("Erreur lors de la lecture du son de notification : ", error);
        });
    }, 1000); // 1000 ms = 1 seconde de délai
}

// 📆 Fonction pour obtenir la date et l'heure actuelles
function getFormattedDate() {
    const now = new Date();
    return now.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 📥 Envoi d'un message texte
sendBtn.addEventListener("click", () => {
    const message = chatInput.value.trim();
    if (message !== "") {
        push(chatRef, { user: "Client", text: message, timestamp: Date.now(), dateFormatted: getFormattedDate() });
        chatInput.value = "";
    }
});

// 📷 Envoi d'une image
imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            push(chatRef, { user: "Client", image: reader.result, timestamp: Date.now(), dateFormatted: getFormattedDate() });
        };
        reader.readAsDataURL(file);
    }
});

// 🎤 Gestion de l'enregistrement audio
let mediaRecorder;
let audioChunks = [];

navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = () => {
            push(chatRef, { user: "Client", audio: reader.result, timestamp: Date.now(), dateFormatted: getFormattedDate() });
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

// 🔄 Réception et affichage des messages
onChildAdded(chatRef, (snapshot) => {
    const data = snapshot.val();
    const messageId = snapshot.key;
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", data.user === "Client" ? "sent" : "received");
    messageElement.setAttribute("data-id", messageId);

    if (data.text) {
        messageElement.innerHTML = `<strong>${data.user}:</strong> ${data.text}`;
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
    }

    const timeStamp = document.createElement("span");
    timeStamp.classList.add("timestamp");
    timeStamp.textContent = data.dateFormatted;
    messageElement.appendChild(timeStamp);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.classList.add("delete-btn");
    deleteBtn.onclick = () => deleteMessage(messageId);
    messageElement.appendChild(deleteBtn);

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    // 🔊 Jouer le son de notification deux fois
    playNotificationSound();
});

// 🛢️ Fonction pour supprimer un message
function deleteMessage(messageId) {
    remove(ref(database, `chat/${messageId}`)).then(() => {
        document.querySelector(`[data-id='${messageId}']`)?.remove();
    }).catch(console.error);
}

// 📞 WebRTC Implementation
let localStream;
let peerConnection;
let callId;
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Générer un ID unique pour l'appel
function generateCallId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Initialiser la connexion peer
function initPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);
    
    // Ajouter les pistes audio locales à la connexion peer
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Écouter les pistes audio distantes
    peerConnection.ontrack = event => {
        remoteAudio.srcObject = event.streams[0];
    };
    
    // Gérer les candidats ICE
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            // Envoyer le candidat ICE via Firebase
            push(ref(database, `calls/${callId}/candidates/caller`), event.candidate.toJSON());
        }
    };
}

// Initier un appel
callBtn.addEventListener("click", async () => {
    try {
        // Désactiver le bouton d'appel pendant l'initialisation
        callBtn.disabled = true;
        
        // Obtenir le flux audio local
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Générer un ID pour l'appel
        callId = generateCallId();
        
        // Initialiser la connexion peer
        initPeerConnection();
        
        // Créer une offre
        const offerDescription = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offerDescription);
        
        // Stocker l'offre dans Firebase
        const callData = {
            offer: {
                type: offerDescription.type,
                sdp: offerDescription.sdp
            },
            status: 'waiting',
            timestamp: Date.now()
        };
        
        await set(ref(database, `calls/${callId}`), callData);
        
        // Afficher l'ID de l'appel pour que l'autre utilisateur puisse répondre
        push(chatRef, { 
            user: "Système", 
            text: `📞 Appel en cours... ID d'appel : ${callId}. Partagez cet ID avec votre correspondant pour qu'il puisse répondre.`, 
            timestamp: Date.now(),
            dateFormatted: getFormattedDate()
        });
        
        // Écouter la réponse
        onValue(ref(database, `calls/${callId}/answer`), async (snapshot) => {
            const answer = snapshot.val();
            if (answer && !peerConnection.currentRemoteDescription) {
                const answerDescription = new RTCSessionDescription(answer);
                await peerConnection.setRemoteDescription(answerDescription);
            }
        });
        
        // Écouter les candidats ICE de la personne qui répond
        onChildAdded(ref(database, `calls/${callId}/candidates/answerer`), async (snapshot) => {
            const candidate = new RTCIceCandidate(snapshot.val());
            await peerConnection.addIceCandidate(candidate);
        });
        
        // Activer le bouton pour terminer l'appel
        hangupBtn.disabled = false;
        
    } catch (error) {
        console.error("Erreur lors de l'initiation de l'appel:", error);
        callBtn.disabled = false;
    }
});

// Répondre à un appel
answerBtn.addEventListener("click", async () => {
    try {
        // Demander l'ID de l'appel
        const promptCallId = prompt("Entrez l'ID de l'appel pour répondre:");
        if (!promptCallId) return;
        
        callId = promptCallId;
        
        // Vérifier si l'appel existe
        const callSnapshot = await get(ref(database, `calls/${callId}`));
        const callData = callSnapshot.val();
        
        if (!callData || !callData.offer) {
            alert("Appel non trouvé ou déjà terminé.");
            return;
        }
        
        // Obtenir le flux audio local
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Initialiser la connexion peer
        initPeerConnection();
        
        // Définir l'offre distante
        const offerDescription = new RTCSessionDescription(callData.offer);
        await peerConnection.setRemoteDescription(offerDescription);
        
        // Créer une réponse
        const answerDescription = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDescription);
        
        // Stocker la réponse dans Firebase
        const answerData = {
            type: answerDescription.type,
            sdp: answerDescription.sdp
        };
        
        await set(ref(database, `calls/${callId}/answer`), answerData);
        await set(ref(database, `calls/${callId}/status`), 'connected');
        
        // Gérer les candidats ICE
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                // Envoyer le candidat ICE via Firebase
                push(ref(database, `calls/${callId}/candidates/answerer`), event.candidate.toJSON());
            }
        };
        
        // Écouter les candidats ICE de l'appelant
        onChildAdded(ref(database, `calls/${callId}/candidates/caller`), async (snapshot) => {
            const candidate = new RTCIceCandidate(snapshot.val());
            await peerConnection.addIceCandidate(candidate);
        });
        
        // Notification dans le chat
        push(chatRef, { 
            user: "Système", 
            text: `📞 Vous avez répondu à l'appel ${callId}`, 
            timestamp: Date.now(),
            dateFormatted: getFormattedDate()
        });
        
        // Activer le bouton pour terminer l'appel
        hangupBtn.disabled = false;
        
    } catch (error) {
        console.error("Erreur lors de la réponse à l'appel:", error);
    }
});

// 🛑 Terminer l'appel
hangupBtn.addEventListener("click", () => {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    hangupBtn.disabled = true;
    callBtn.disabled = false;
    answerBtn.disabled = false;
});
