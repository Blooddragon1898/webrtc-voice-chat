// Voice Chat Client
class VoiceChat {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentRoomId = null;
        this.remoteUserId = null;
        this.isMuted = false;
        this.isCallActive = false;
        this.audioContext = null;
        this.localAnalyser = null;
        this.remoteAnalyser = null;
        this.localAudioData = null;
        this.remoteAudioData = null;
        this.animationFrameId = null;
        
        this.peerConnectionConfig = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" }
            ],
            iceCandidatePoolSize: 10
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.generateRoomId();
        this.log("Voice Chat инициализирован", "info");
        this.log(`WebRTC поддержка: ${!!window.RTCPeerConnection}`, "info");
    }
    
    bindEvents() {
        document.getElementById("generateBtn")?.addEventListener("click", () => this.generateRoomId());
        document.getElementById("createBtn")?.addEventListener("click", () => this.createRoom());
        document.getElementById("joinBtn")?.addEventListener("click", () => this.joinRoom());
        document.getElementById("micBtn")?.addEventListener("click", () => this.toggleMic());
        document.getElementById("endBtn")?.addEventListener("click", () => this.endCall());
        document.getElementById("copyBtn")?.addEventListener("click", () => this.copyRoomId());
        
        document.getElementById("roomId")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") this.joinRoom();
        });
    }
    
    log(message, type = "info") {
        const time = new Date().toLocaleTimeString();
        const colors = {
            info: "#2196F3",
            success: "#4CAF50",
            error: "#f44336",
            warning: "#ff9800"
        };
        
        console.log(`%c[${type.toUpperCase()}] ${message}`, `color: ${colors[type] || "#666"}`);
        
        const logDiv = document.getElementById("log");
        if (logDiv) {
            const entry = document.createElement("div");
            entry.style.color = colors[type] || "#666";
            entry.style.margin = "2px 0";
            entry.style.fontSize = "12px";
            entry.style.fontFamily = "monospace";
            entry.textContent = `[${time}] ${message}`;
            logDiv.appendChild(entry);
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    }
    
    updateStatus(text, type = "info") {
        const statusDiv = document.getElementById("status");
        if (statusDiv) {
            statusDiv.textContent = text;
            statusDiv.className = `status ${type}`;
        }
    }
    
    updateCallStatus(text, type = "info") {
        const statusDiv = document.getElementById("callStatus");
        if (statusDiv) {
            statusDiv.textContent = text;
            statusDiv.className = `status ${type}`;
        }
    }
    
    generateRoomId() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let roomId = "";
        for (let i = 0; i < 6; i++) {
            roomId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        const roomIdInput = document.getElementById("roomId");
        if (roomIdInput) {
            roomIdInput.value = roomId;
        }
        
        this.log(`Сгенерирован ID: ${roomId}`, "info");
        return roomId;
    }
    
    createRoom() {
        const roomId = this.generateRoomId();
        this.joinRoom(roomId);
    }
    
    async joinRoom(roomId = null) {
        const roomIdInput = document.getElementById("roomId");
        const usernameInput = document.getElementById("username");
        
        const roomIdToUse = roomId || (roomIdInput?.value.trim().toUpperCase() || "");
        const username = usernameInput?.value.trim() || "Гость";
        
        if (!roomIdToUse) {
            alert("Введите ID комнаты");
            return;
        }
        
        this.log(`Присоединение к комнате: ${roomIdToUse}`, "info");
        this.updateStatus("Запрос микрофона...", "connecting");
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 48000,
                    sampleSize: 16
                },
                video: false
            });
            
            this.log(" Микрофон доступен", "success");
            this.updateStatus("Микрофон подключен", "online");
            
            this.setupAudioContext();
            this.setupLocalAudioMonitoring();
            
            this.connectToServer(roomIdToUse, username);
            
        } catch (error) {
            this.log(` Ошибка микрофона: ${error.message}`, "error");
            this.updateStatus("Ошибка микрофона", "offline");
            
            if (error.name === "NotAllowedError") {
                alert("Разрешите доступ к микрофону в настройках браузера");
            }
        }
    }
    
    setupAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log("Аудио контекст создан", "info");
        } catch (e) {
            this.log(`Аудио контекст не доступен: ${e}`, "warning");
        }
    }
    
    setupLocalAudioMonitoring() {
        if (!this.localStream || !this.audioContext) return;
        
        try {
            this.localAnalyser = this.audioContext.createAnalyser();
            this.localAnalyser.fftSize = 32;
            this.localAnalyser.smoothingTimeConstant = 0.3;
            
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            source.connect(this.localAnalyser);
            
            this.localAudioData = new Uint8Array(this.localAnalyser.frequencyBinCount);
            
            this.log("Мониторинг локального аудио запущен", "info");
        } catch (e) {
            this.log(`Мониторинг аудио не доступен: ${e}`, "warning");
        }
    }
    
    setupRemoteAudioMonitoring() {
        if (!this.remoteStream || !this.audioContext) return;
        
        try {
            this.remoteAnalyser = this.audioContext.createAnalyser();
            this.remoteAnalyser.fftSize = 32;
            this.remoteAnalyser.smoothingTimeConstant = 0.3;
            
            const source = this.audioContext.createMediaStreamSource(this.remoteStream);
            source.connect(this.remoteAnalyser);
            
            this.remoteAudioData = new Uint8Array(this.remoteAnalyser.frequencyBinCount);
            
            this.log("Мониторинг удаленного аудио запущен", "info");
        } catch (e) {
            this.log(`Мониторинг удаленного аудио не доступен: ${e}`, "warning");
        }
    }
    
    updateAudioVisualizers() {
        if (!this.audioContext || this.audioContext.state === "suspended") {
            this.audioContext?.resume();
        }
        
        if (this.localAnalyser && this.localAudioData) {
            this.localAnalyser.getByteFrequencyData(this.localAudioData);
            const average = this.localAudioData.reduce((a, b) => a + b) / this.localAudioData.length;
            this.updateVisualizer("localVisualizer", average);
        }
        
        if (this.remoteAnalyser && this.remoteAudioData) {
            this.remoteAnalyser.getByteFrequencyData(this.remoteAudioData);
            const average = this.remoteAudioData.reduce((a, b) => a + b) / this.remoteAudioData.length;
            this.updateVisualizer("remoteVisualizer", average);
            
            if (average > 5 && !this.isCallActive) {
                this.isCallActive = true;
                this.updateCallStatus("Соединение установлено! ", "online");
            }
        }
        
        if (this.isCallActive) {
            this.animationFrameId = requestAnimationFrame(() => this.updateAudioVisualizers());
        }
    }
    
    updateVisualizer(visualizerId, level) {
        const visualizer = document.getElementById(visualizerId);
        if (!visualizer) return;
        
        const bars = visualizer.querySelectorAll(".audio-bar");
        const barCount = bars.length;
        const normalizedLevel = Math.min(level / 255, 1);
        const activeBars = Math.ceil(normalizedLevel * barCount);
        
        bars.forEach((bar, index) => {
            const height = index < activeBars ? 
                `${5 + (normalizedLevel * 25)}px` : "3px";
            bar.style.height = height;
            bar.classList.toggle("active", index < activeBars);
        });
    }
    
    connectToServer(roomId, username) {
        this.socket = io();
        
        this.socket.on("connect", () => {
            this.log(` Подключено к серверу. Socket ID: ${this.socket.id}`, "success");
            this.updateStatus("Подключено", "online");
            
            this.socket.emit("join-room", {
                roomId: roomId,
                username: username
            });
            
            this.showCallScreen(username, roomId);
        });
        
        this.socket.on("room-joined", (data) => {
            this.log(` Вошли в комнату ${data.roomId}`, "success");
            this.currentRoomId = data.roomId;
            document.getElementById("currentRoomId").textContent = data.roomId;
            
            if (data.otherUsers.length > 0) {
                const otherUser = data.otherUsers[0];
                this.onUserJoined(otherUser.userId, otherUser.username, false);
            } else {
                this.updateCallStatus("Ожидание собеседника...", "connecting");
                this.log("Вы первый в комнате. Ожидайте второго участника.", "info");
            }
        });
        
        this.socket.on("user-joined", (data) => {
            this.onUserJoined(data.userId, data.username, data.shouldInitiateCall);
        });
        
        this.socket.on("user-disconnected", (data) => {
            this.log(` ${data.username || "Собеседник"} покинул звонок`, "warning");
            this.onUserLeft();
        });
        
        this.socket.on("offer", async (data) => {
            this.log(` ВХОДЯЩИЙ ЗВОНОК от ${data.username} (${data.from})`, "info");
            await this.handleOffer(data);
        });
        
        this.socket.on("answer", async (data) => {
            this.log(` ПОЛУЧЕН ANSWER от ${data.from}`, "info");
            await this.handleAnswer(data);
        });
        
        this.socket.on("ice-candidate", async (data) => {
            this.log(` ICE от ${data.from}`, "info");
            await this.handleIceCandidate(data);
        });
        
        this.socket.on("room-full", () => {
            this.log(" Комната заполнена", "error");
            alert("Комната заполнена (максимум 2 участника)");
            this.endCall();
        });
        
        this.socket.on("error", (data) => {
            this.log(` Ошибка сервера: ${data.message}`, "error");
        });
        
        this.socket.on("disconnect", () => {
            this.log(" Отключено от сервера", "error");
            this.updateStatus("Отключено", "offline");
        });
    }
    
    onUserJoined(userId, username, shouldInitiateCall) {
        this.remoteUserId = userId;
        
        document.getElementById("remoteUser").textContent = username;
        document.getElementById("remoteAvatar").className = "avatar";
        document.getElementById("remoteAvatar").style.background = "#4CAF50";
        document.getElementById("remoteStatus").textContent = "Подключен";
        
        this.log(` Собеседник: ${username} (${userId})`, "success");
        
        if (shouldInitiateCall) {
            this.updateCallStatus("Инициируем звонок...", "connecting");
            this.log("Вы инициатор звонка. Создаем PeerConnection...", "info");
            
            setTimeout(() => {
                this.createPeerConnection(true);
            }, 1000);
        } else {
            this.updateCallStatus("Ожидаем входящий звонок...", "connecting");
            this.log("Вы принимающий. Ожидаем offer...", "info");
        }
    }
    
    onUserLeft() {
        document.getElementById("remoteUser").textContent = "Ожидание...";
        document.getElementById("remoteAvatar").className = "avatar waiting";
        document.getElementById("remoteAvatar").style.background = "#ccc";
        document.getElementById("remoteStatus").textContent = "Не подключен";
        
        this.updateCallStatus("Собеседник покинул", "connecting");
        this.cleanupPeerConnection();
        this.remoteUserId = null;
        this.isCallActive = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    showCallScreen(username, roomId) {
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("callScreen").style.display = "block";
        document.getElementById("localUser").textContent = username;
        document.getElementById("currentRoomId").textContent = roomId;
    }
    
    async createPeerConnection(isInitiator = false) {
        this.log("=== СОЗДАНИЕ PEERCONNECTION ===", "info");
        this.log(`Инициатор: ${isInitiator}, Удаленный ID: ${this.remoteUserId}`, "info");
        
        try {
            this.peerConnection = new RTCPeerConnection(this.peerConnectionConfig);
            
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
                this.log(`Добавлен трек: ${track.kind}`, "info");
            });
            
            this.peerConnection.ontrack = (event) => {
                this.log(" ПОЛУЧЕН УДАЛЕННЫЙ АУДИОПОТОК!", "success");
                this.remoteStream = event.streams[0];
                
                const remoteAudio = document.getElementById("remoteAudio");
                remoteAudio.srcObject = this.remoteStream;
                remoteAudio.volume = 1.0;
                remoteAudio.muted = false;
                
                const playAudio = () => {
                    this.log(" Пытаемся воспроизвести аудио...", "info");
                    
                    remoteAudio.play()
                        .then(() => {
                            this.log(" Аудио воспроизводится!", "success");
                            this.updateCallStatus("Соединение установлено! ", "online");
                            this.isCallActive = true;
                            
                            this.setupRemoteAudioMonitoring();
                            this.updateAudioVisualizers();
                            
                            setTimeout(() => {
                                if (this.isCallActive) {
                                    alert(" Голосовая связь установлена! Говорите в микрофон.");
                                }
                            }, 500);
                        })
                        .catch(e => {
                            this.log(` Ошибка воспроизведения: ${e.message}`, "error");
                            
                            if (this.isCallActive) {
                                setTimeout(playAudio, 1000);
                            }
                        });
                };
                
                setTimeout(playAudio, 300);
            };
            
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.socket && this.remoteUserId) {
                    this.log(` Локальный ICE кандидат`, "info");
                    this.socket.emit("ice-candidate", {
                        target: this.remoteUserId,
                        candidate: event.candidate
                    });
                }
            };
            
            this.peerConnection.oniceconnectionstatechange = () => {
                const state = this.peerConnection.iceConnectionState;
                this.log(` ICE состояние: ${state}`, "info");
                
                switch (state) {
                    case "checking":
                        this.updateCallStatus("Устанавливаем соединение...", "connecting");
                        break;
                    case "connected":
                    case "completed":
                        this.log(" WebRTC соединение установлено!", "success");
                        this.updateCallStatus("Соединение установлено", "online");
                        break;
                    case "failed":
                        this.log(" WebRTC соединение не удалось", "error");
                        this.updateCallStatus("Ошибка соединения", "offline");
                        setTimeout(() => {
                            if (this.remoteUserId && !this.isCallActive) {
                                this.log("Попытка переподключения...", "info");
                                this.cleanupPeerConnection();
                                this.createPeerConnection(isInitiator);
                            }
                        }, 2000);
                        break;
                }
            };
            
            this.peerConnection.onsignalingstatechange = () => {
                this.log(` Signaling состояние: ${this.peerConnection.signalingState}`, "info");
            };
            
            if (isInitiator && this.remoteUserId) {
                try {
                    this.log("Создаем offer...", "info");
                    const offer = await this.peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: false
                    });
                    
                    this.log(`Offer создан: ${offer.type}`, "info");
                    await this.peerConnection.setLocalDescription(offer);
                    
                    this.socket.emit("offer", {
                        target: this.remoteUserId,
                        offer: offer
                    });
                    
                    this.log(` Offer отправлен на ${this.remoteUserId}`, "success");
                    this.updateCallStatus("Отправляем запрос на соединение...", "connecting");
                    
                } catch (error) {
                    this.log(` Ошибка создания offer: ${error}`, "error");
                }
            }
            
            this.log("=== PEERCONNECTION СОЗДАН ===", "success");
            
        } catch (error) {
            this.log(` Ошибка создания PeerConnection: ${error}`, "error");
        }
    }
    
    async handleOffer(data) {
        this.log("=== ОБРАБОТКА ВХОДЯЩЕГО OFFER ===", "info");
        
        if (!this.peerConnection) {
            this.log("Создаем PeerConnection для принятия звонка", "info");
            await this.createPeerConnection(false);
        }
        
        try {
            this.log(`Устанавливаем удаленный offer от ${data.from}`, "info");
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            this.log(" Удаленный offer установлен", "success");
            
            this.log("Создаем answer...", "info");
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit("answer", {
                target: data.from,
                answer: answer
            });
            
            this.log(` Answer отправлен на ${data.from}`, "success");
            this.updateCallStatus("Принимаем звонок...", "connecting");
            
        } catch (error) {
            this.log(` Ошибка обработки offer: ${error}`, "error");
        }
    }
    
    async handleAnswer(data) {
        this.log("=== ОБРАБОТКА ANSWER ===", "info");
        
        if (!this.peerConnection) {
            this.log(" Нет активного PeerConnection", "error");
            return;
        }
        
        try {
            this.log(`Устанавливаем удаленный answer от ${data.from}`, "info");
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            this.log(" Удаленный answer установлен", "success");
            
        } catch (error) {
            this.log(` Ошибка обработки answer: ${error}`, "error");
        }
    }
    
    async handleIceCandidate(data) {
        if (!this.peerConnection) return;
        
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            this.log(` ICE кандидат добавлен от ${data.from}`, "info");
        } catch (error) {
            this.log(` Ошибка добавления ICE: ${error}`, "error");
        }
    }
    
    toggleMic() {
        if (!this.localStream) return;
        
        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        
        const micBtn = document.getElementById("micBtn");
        micBtn.textContent = this.isMuted ? "" : "";
        micBtn.style.background = this.isMuted ? "#f44336" : "#4CAF50";
        
        document.getElementById("localStatus").textContent = 
            this.isMuted ? " Выключен" : " Включен";
        
        this.log(this.isMuted ? "Микрофон выключен" : "Микрофон включен", "info");
    }
    
    endCall() {
        this.log("=== ЗАВЕРШЕНИЕ ЗВОНКА ===", "info");
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
            this.log("PeerConnection закрыт", "info");
        }
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.log("Socket отключен", "info");
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            this.log("Локальный поток остановлен", "info");
        }
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        document.getElementById("callScreen").style.display = "none";
        document.getElementById("loginScreen").style.display = "block";
        this.updateStatus("Отключено", "offline");
        
        this.remoteUserId = null;
        this.currentRoomId = null;
        this.isCallActive = false;
        this.remoteStream = null;
    }
    
    cleanupPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
            this.log("PeerConnection очищен", "info");
        }
    }
    
    copyRoomId() {
        if (this.currentRoomId) {
            navigator.clipboard.writeText(this.currentRoomId)
                .then(() => {
                    this.log(`ID скопирован: ${this.currentRoomId}`, "success");
                    alert(`ID комнаты скопирован: ${this.currentRoomId}`);
                })
                .catch(err => {
                    this.log(`Ошибка копирования: ${err}`, "error");
                });
        }
    }
}

// Инициализация
window.addEventListener("DOMContentLoaded", () => {
    window.voiceChat = new VoiceChat();
    
    // Глобальная функция для отладки
    window.debugVoiceChat = () => {
        console.log("=== VOICE CHAT DEBUG ===");
        console.log("Remote User ID:", window.voiceChat.remoteUserId);
        console.log("Current Room:", window.voiceChat.currentRoomId);
        console.log("Socket Connected:", window.voiceChat.socket?.connected);
        console.log("Call Active:", window.voiceChat.isCallActive);
        console.log("Muted:", window.voiceChat.isMuted);
        
        if (window.voiceChat.peerConnection) {
            console.log("PeerConnection State:", {
                iceConnectionState: window.voiceChat.peerConnection.iceConnectionState,
                signalingState: window.voiceChat.peerConnection.signalingState,
                connectionState: window.voiceChat.peerConnection.connectionState
            });
            
            const senders = window.voiceChat.peerConnection.getSenders();
            console.log("Senders:", senders.length);
            senders.forEach((sender, i) => {
                console.log(`  Sender ${i}:`, sender.track ? "Есть трек" : "Нет трека");
            });
            
            const receivers = window.voiceChat.peerConnection.getReceivers();
            console.log("Receivers:", receivers.length);
            receivers.forEach((receiver, i) => {
                console.log(`  Receiver ${i}:`, receiver.track ? "Есть трек" : "Нет трека");
            });
        }
        
        const audio = document.getElementById("remoteAudio");
        if (audio) {
            console.log("Audio Element:", {
                srcObject: !!audio.srcObject,
                paused: audio.paused,
                muted: audio.muted,
                volume: audio.volume,
                readyState: audio.readyState
            });
        }
        
        if (window.voiceChat.localStream) {
            const tracks = window.voiceChat.localStream.getAudioTracks();
            console.log("Local Tracks:", tracks.length);
            tracks.forEach((track, i) => {
                console.log(`  Track ${i}: enabled=${track.enabled}, muted=${track.muted}`);
            });
        }
    };
});
