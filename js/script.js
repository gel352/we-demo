// 微信风格手机端聊天应用 - 完整实现（优化新消息实时显示）
document.addEventListener('DOMContentLoaded', function () {
    // DOM 元素
    const loginPage = document.getElementById('loginPage');
    const chatListPage = document.getElementById('chatListPage');
    const chatPage = document.getElementById('chatPage');
    const contactsPage = document.getElementById('contactsPage');
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('usernameInput');
    const serverInput = document.getElementById('serverInput');
    const loginButton = document.getElementById('loginButton');
    const chatList = document.getElementById('chatList');
    const contactsList = document.getElementById('contactsList');
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const chatTitle = document.getElementById('chatTitle');
    const backButton = document.getElementById('backButton');
    const contactsBackButton = document.getElementById('contactsBackButton');
    const onlineUsersList = document.getElementById('onlineUsersList');
    const onlineCount = document.getElementById('onlineCount');
    const addFriendButton = document.getElementById('addFriendButton');
    const searchButton = document.getElementById('searchButton');
    const currentUserName = document.getElementById('currentUserName');
    const currentUserId = document.getElementById('currentUserId');
    const currentUserAvatar = document.getElementById('currentUserAvatar');
    const userTypeTag = document.getElementById('userTypeTag');
    const connectionUrl = document.getElementById('connectionUrl');
    const lanConnectionUrl = document.getElementById('lanConnectionUrl');

    // 应用状态（新增：当前激活页面标记，用于精准更新）
    let currentActivePage = loginPage;
    let ws = null;
    let currentUser = null;
    let selectedChat = null;
    let onlineUsers = [];
    let chatHistory = {};
    let unreadMessages = {};
    let messageQueue = [];
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    // 初始化应用
    initApp();

    function initApp() {
        setupEventListeners();
        checkSavedLogin();
        detectLocalIP();
        checkUrlParams();
        // 初始化时添加新消息高亮CSS
        addHighlightStyle();
    }

    function checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const nameType = urlParams.get('type');
        if (nameType === 'name') {
            const presetName = urlParams.get('name') || '用户';
            usernameInput.value = presetName;
            showNotification(`已自动填充用户名: ${presetName}`);
        }
    }

    function detectLocalIP() {
        const serverInput = document.getElementById('serverInput');
        const host = window.location.hostname;
        const customPort = '8080';
        let defaultWsUrl = `ws://${host}:${customPort}`;

        if (!serverInput.value || serverInput.value === 'ws://localhost:8080') {
            serverInput.value = defaultWsUrl;
        }
        connectionUrl.style.display = 'block';
        lanConnectionUrl.innerText = defaultWsUrl;

        const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
        if (RTCPeerConnection) {
            try {
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel('');
                pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(err => {
                    console.log('局域网IP检测失败:', err);
                });

                let ipFound = false;
                pc.onicecandidate = (ice) => {
                    if (ipFound || !ice || !ice.candidate || !ice.candidate.candidate) return;
                    const match = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate);
                    if (!match || !match[1]) return;

                    const myIP = match[1];
                    if (myIP.startsWith('192.168.') || myIP.startsWith('10.') ||
                        (myIP.startsWith('172.') && parseInt(myIP.split('.')[1]) >= 16 && parseInt(myIP.split('.')[1]) <= 31)) {
                        ipFound = true;
                        const lanWsUrl = `ws://${myIP}:${customPort}`;
                        if (lanWsUrl !== defaultWsUrl) {
                            const lanInfo = document.createElement('div');
                            lanInfo.style.marginTop = '8px';
                            lanInfo.style.fontSize = '11px';
                            lanInfo.style.color = '#666';
                            lanInfo.innerHTML = `<strong>局域网备选地址：</strong>${lanWsUrl}`;
                            connectionUrl.appendChild(lanInfo);
                        }
                    }
                    pc.onicecandidate = () => { };
                    pc.close();
                };
            } catch (error) {
                console.log('局域网IP检测出错:', error);
            }
        }
    }

    function checkSavedLogin() {
        const savedUsername = localStorage.getItem('chat_username');
        const savedServer = localStorage.getItem('chat_server');
        if (savedUsername && savedServer) {
            usernameInput.value = savedUsername;
            serverInput.value = savedServer;
        }
    }

    function setupEventListeners() {
        // 登录表单提交
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            login();
        });

        // 标签栏切换（关键：更新当前激活页面）
        document.querySelectorAll('.tab-item').forEach((tab, index) => {
            tab.addEventListener('click', () => {
                if (index === 1) {
                    showPage(contactsPage);
                } else {
                    showPage(chatListPage);
                }
                document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });

        // 返回按钮（关键：更新当前激活页面）
        backButton.addEventListener('click', () => {
            selectedChat = null;
            showPage(chatListPage);
        });

        contactsBackButton.addEventListener('click', () => {
            showPage(chatListPage);
        });

        // 发送消息
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // 输入框高度自适应
        messageInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 80) + 'px';
        });

        // 功能按钮
        addFriendButton.addEventListener('click', function () {
            showNotification('添加好友功能需后端支持');
        });
        searchButton.addEventListener('click', function () {
            showNotification('搜索功能需后端支持');
        });

        // 新增：监听页面点击，确保激活状态同步（解决窗口切换后状态丢失）
        document.addEventListener('click', function (e) {
            const targetPage = e.target.closest('.page');
            if (targetPage && targetPage.classList.contains('active')) {
                currentActivePage = targetPage;
            }
        });
    }

    function login() {
        const username = usernameInput.value.trim();
        const server = serverInput.value.trim();
        if (!username) {
            showNotification('请输入用户名');
            return;
        }
        if (!server) {
            showNotification('请输入服务器地址');
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = '登录中...';
        localStorage.setItem('chat_username', username);
        localStorage.setItem('chat_server', server);

        const userId = generateUserId(username);
        currentUser = userId; // 关键：提前赋值currentUser，避免消息处理时为null
        currentUserName.textContent = username;
        currentUserId.textContent = userId;
        currentUserAvatar.textContent = username.charAt(0);
        userTypeTag.textContent = `用户: ${username}`;

        connectWebSocket(server, userId, username);
        updateUrlWithNameType(username);
    }

    function updateUrlWithNameType(username) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('type', 'name');
        newUrl.searchParams.set('name', username);
        window.history.replaceState({}, '', newUrl);
        console.log('URL已更新为:', newUrl.toString());
    }

    function generateUserId(username) {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `user_${timestamp}_${random}_${username}`;
    }

    function connectWebSocket(serverUrl, userId, username) {
        updateStatus('connecting', '连接中...');
        try {
            ws = new WebSocket(`${serverUrl}?userId=${encodeURIComponent(userId)}&username=${encodeURIComponent(username)}`);

            ws.onopen = function () {
                updateStatus('connected', '已连接');
                reconnectAttempts = 0;
                sendWebSocketMessage({
                    type: 'register',
                    userId: userId,
                    userName: username,
                    timestamp: Date.now()
                });
                showPage(chatListPage);
                showNotification('登录成功！');
                showLanConnectionUrl(serverUrl);
            };

            ws.onmessage = function (event) {
                try {
                    const message = JSON.parse(event.data);
                    handleWebSocketMessage(message);
                } catch (error) {
                    console.error('消息解析错误:', error);
                }
            };

            ws.onclose = function () {
                updateStatus('disconnected', '连接已断开');
                if (reconnectAttempts < maxReconnectAttempts) {
                    setTimeout(() => {
                        reconnectAttempts++;
                        connectWebSocket(serverUrl, userId, username);
                    }, 2000);
                } else {
                    showNotification('连接失败，请检查服务器地址');
                    loginButton.disabled = false;
                    loginButton.textContent = '登录';
                }
            };

            ws.onerror = function (error) {
                console.error('WebSocket错误:', error);
                updateStatus('disconnected', '连接错误');
                showNotification('连接失败，请检查服务器地址');
                loginButton.disabled = false;
                loginButton.textContent = '登录';
            };

        } catch (error) {
            console.error('连接失败:', error);
            updateStatus('disconnected', '连接失败');
            showNotification('连接失败，请检查服务器地址');
            loginButton.disabled = false;
            loginButton.textContent = '登录';
        }
    }

    function showLanConnectionUrl(serverUrl) {
        const url = new URL(serverUrl);
        const hostname = url.hostname;
        const port = url.port || '8080';
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            detectLocalIP();
        } else {
            connectionUrl.style.display = 'block';
            lanConnectionUrl.textContent = serverUrl;
        }
    }

    function updateStatus(status, text) {
        statusIndicator.className = 'status-indicator';
        statusIndicator.classList.add('status-' + status);
        statusText.textContent = text;
    }

    function sendWebSocketMessage(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        } else {
            messageQueue.push(message);
            showNotification('连接中断，消息已缓存');
        }
    }

    function handleWebSocketMessage(message) {
        switch (message.type) {
            case 'userList':
                updateOnlineUsers(message.users);
                break;
            case 'message':
                // 关键：无论当前在哪个页面，都立即处理新消息
                handleIncomingMessage(message);
                break;
            case 'system':
                handleSystemMessage(message);
                break;
            case 'error':
                handleErrorMessage(message);
                break;
            case 'ack':
                handleMessageAck(message);
                break;
        }
    }

    function updateOnlineUsers(users) {
        onlineUsers = users.filter(user => user.id !== currentUser);
        renderOnlineUsers();
        onlineCount.textContent = `${onlineUsers.length}人在线`;
        renderContactsList(onlineUsers);
    }

    function renderOnlineUsers() {
        if (onlineUsers.length === 0) {
            onlineUsersList.innerHTML = `
                <div class="empty-online-users">
                    <i class="fas fa-users"></i>
                    <div>暂无其他在线用户</div>
                </div>
            `;
            return;
        }
        onlineUsersList.innerHTML = '';
        onlineUsers.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'online-user-item';
            userItem.dataset.userId = user.id;
            userItem.innerHTML = `
                <div class="online-user-avatar">${user.name.charAt(0)}</div>
                <div class="online-user-name">${user.name}</div>
            `;
            userItem.addEventListener('click', () => {
                openChatWithUser(user);
            });
            onlineUsersList.appendChild(userItem);
        });
    }

    function renderContactsList(contacts) {
        if (contacts.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-chat-list">
                    <i class="fas fa-address-book"></i>
                    <div>暂无联系人</div>
                    <div class="empty-hint">在线用户将显示在这里</div>
                </div>
            `;
            return;
        }
        contactsList.innerHTML = '';
        contacts.forEach(contact => {
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item';
            contactItem.dataset.contactId = contact.id;
            contactItem.innerHTML = `
                <div class="contact-avatar">${contact.name.charAt(0)}</div>
                <div class="contact-name">${contact.name}</div>
            `;
            contactItem.addEventListener('click', () => {
                openChatWithUser(contact);
            });
            contactsList.appendChild(contactItem);
        });
    }

    // 关键优化1：打开聊天时立即同步未读状态，避免状态残留
    function openChatWithUser(user) {
        selectedChat = {
            id: user.id,
            name: user.name,
            avatar: user.name.charAt(0)
        };
        // 清除未读并实时更新列表
        if (unreadMessages[user.id]) {
            delete unreadMessages[user.id];
            updateChatList(); // 立即刷新聊天列表，移除未读标记
        }
        if (!chatHistory[user.id]) {
            chatHistory[user.id] = [];
        }
        openChat(selectedChat);
    }

    function openChat(chat) {
        chatTitle.textContent = chat.name;
        messagesContainer.innerHTML = '';
        const history = chatHistory[chat.id] || [];
        if (history.length === 0) {
            addSystemMessage('开始和对方聊天吧！');
        } else {
            history.forEach(msg => {
                if (msg.sender === 'me') {
                    addSentMessage(msg.content, msg.time, msg.status);
                } else {
                    addReceivedMessage(chat.name, chat.avatar, msg.content, msg.time);
                }
            });
        }
        showPage(chatPage);
        setTimeout(() => {
            messageInput.focus();
        }, 300);
    }

    // 关键优化2：新消息处理逻辑，根据当前页面实时更新UI
    function handleIncomingMessage(message) {
        const senderId = message.from;
        const senderName = message.fromName || '未知用户';
        const content = message.content;
        const timestamp = new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // 1. 确保聊天历史存在，避免空引用
        if (!chatHistory[senderId]) {
            chatHistory[senderId] = [];
        }
        // 2. 保存新消息到历史（带完整 senderName，避免显示异常）
        chatHistory[senderId].push({
            sender: 'them',
            senderName: senderName,
            content: content,
            time: timestamp
        });

        // 3. 根据当前页面，精准更新UI（复刻微信体验）
        if (currentActivePage === chatPage && selectedChat && selectedChat.id === senderId) {
            // 场景1：在与发送者的聊天页 → 直接显示消息
            addReceivedMessage(senderName, senderName.charAt(0), content, timestamp);
        } else {
            // 场景2：在聊天列表/联系人页 → 更新未读+高亮+通知
            unreadMessages[senderId] = (unreadMessages[senderId] || 0) + 1;
            showNotification(`新消息来自: ${senderName}`);
            // 立即更新聊天列表（无论是否在当前页，确保切换回来能看到）
            updateChatList();
            // 如果当前在聊天列表页，添加高亮动画
            if (currentActivePage === chatListPage) {
                highlightNewMessage(senderId);
            }
        }

        // 4. 发送已读回执（必须执行，避免后端重复推送）
        sendWebSocketMessage({
            type: 'ack',
            messageId: message.id,
            timestamp: Date.now()
        });
    }

    // 关键优化3：聊天列表实时更新，确保未读和最新消息同步
    function updateChatList() {
        chatList.innerHTML = '';
        // 先获取所有聊天ID，并按最后一条消息时间排序（新消息在前，复刻微信）
        const chatIds = Object.keys(chatHistory).sort((a, b) => {
            const lastMsgA = chatHistory[a][chatHistory[a].length - 1];
            const lastMsgB = chatHistory[b][chatHistory[b].length - 1];
            return new Date(lastMsgB.time) - new Date(lastMsgA.time);
        });

        if (chatIds.length === 0) {
            chatList.innerHTML = `
                <div class="empty-chat-list">
                    <i class="far fa-comments"></i>
                    <div>暂无聊天记录</div>
                    <div class="empty-hint">从在线用户中选择一个开始聊天</div>
                </div>
            `;
            return;
        }

        // 遍历生成聊天项（确保未读标记和最新消息实时显示）
        chatIds.forEach(userId => {
            const history = chatHistory[userId];
            if (history.length === 0) return;

            const lastMessage = history[history.length - 1];
            const user = onlineUsers.find(u => u.id === userId) || {
                name: lastMessage.senderName || '未知用户',
                id: userId
            };
            const unreadCount = unreadMessages[userId] || 0;

            const chatItem = document.createElement('div');
            chatItem.className = `chat-item ${unreadCount > 0 ? 'unread' : ''}`;
            chatItem.dataset.chatId = userId;
            chatItem.innerHTML = `
                <div class="chat-avatar">${user.name.charAt(0)}</div>
                <div class="chat-info">
                    <div class="chat-name">${user.name}</div>
                    <div class="chat-preview">${lastMessage.content}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${lastMessage.time}</div>
                    ${unreadCount > 0 ? `<div class="chat-badge">${unreadCount}</div>` : ''}
                </div>
            `;
            chatItem.addEventListener('click', () => {
                openChatWithUser(user);
            });
            chatList.appendChild(chatItem);
        });
    }

    function sendMessage() {
        const content = messageInput.value.trim();
        if (!content) return;
        if (!selectedChat) {
            showNotification('请先选择一个用户');
            return;
        }

        const messageId = generateMessageId();
        const timestamp = new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (!chatHistory[selectedChat.id]) {
            chatHistory[selectedChat.id] = [];
        }
        chatHistory[selectedChat.id].push({
            sender: 'me',
            content: content,
            time: timestamp,
            status: 'sending',
            id: messageId
        });

        addSentMessage(content, timestamp, 'sending');
        sendWebSocketMessage({
            type: 'message',
            to: selectedChat.id,
            content: content,
            id: messageId,
            timestamp: Date.now()
        });

        messageInput.value = '';
        messageInput.style.height = 'auto';
        updateChatList(); // 发送后立即更新聊天列表，显示自己的最新消息
    }

    function generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    function addReceivedMessage(name, avatar, content, timestamp) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message received';
        messageElement.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-bubble">${content}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;
        messagesContainer.appendChild(messageElement);
        scrollToBottom();
    }

    function addSentMessage(content, timestamp, status = 'sent') {
        const messageElement = document.createElement('div');
        messageElement.className = 'message sent';
        const statusHtml = status === 'sending' ?
            '<div class="message-status"><span class="loading"></span> 发送中</div>' :
            '<div class="message-status">已发送</div>';

        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">${content}</div>
                <div class="message-time">${timestamp}</div>
                ${statusHtml}
            </div>
            <div class="message-avatar">我</div>
        `;
        messagesContainer.appendChild(messageElement);
        scrollToBottom();
    }

    function addSystemMessage(content) {
        const messageElement = document.createElement('div');
        messageElement.style.textAlign = 'center';
        messageElement.style.margin = '10px 0';
        messageElement.style.fontSize = '12px';
        messageElement.style.color = '#999';
        messageElement.textContent = content;
        messagesContainer.appendChild(messageElement);
        scrollToBottom();
    }

    function handleSystemMessage(message) {
        addSystemMessage(message.content);
        showNotification(message.content);
    }

    function handleErrorMessage(message) {
        showNotification(`错误: ${message.content}`);
        console.error('服务器错误:', message);
    }

    function handleMessageAck(message) {
        if (selectedChat && chatHistory[selectedChat.id]) {
            const msgIndex = chatHistory[selectedChat.id].findIndex(
                msg => msg.id === message.messageId
            );
            if (msgIndex > -1) {
                chatHistory[selectedChat.id][msgIndex].status = 'sent';
                const messageElements = document.querySelectorAll('.message.sent');
                if (messageElements.length > 0) {
                    const lastMessage = messageElements[messageElements.length - 1];
                    const statusElement = lastMessage.querySelector('.message-status');
                    if (statusElement) {
                        statusElement.innerHTML = '已送达';
                    }
                }
                // 消息状态更新后，同步更新聊天列表预览
                updateChatList();
            }
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }

    // 关键优化4：显示页面时同步更新当前激活页面标记，确保消息处理精准
    function showPage(page) {
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        page.classList.add('active');
        currentActivePage = page; // 实时更新当前激活页面
        // 切换到聊天列表页时，立即刷新列表（避免状态滞后）
        if (page === chatListPage) {
            updateChatList();
        }
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 10000;
            max-width: 80%;
            text-align: center;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 3000);
    }

    // 关键优化5：页面可见性变化时，强制更新所有状态（解决窗口切换后无响应）
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            // 页面重新显示时，无论在哪个页面都刷新
            if (currentActivePage === chatListPage) {
                updateChatList();
            } else if (currentActivePage === contactsPage) {
                renderContactsList(onlineUsers);
            } else if (currentActivePage === chatPage && selectedChat) {
                // 回到聊天页时，刷新当前聊天历史（避免消息丢失）
                openChat(selectedChat);
            }
            // 同时请求最新用户列表，确保在线状态同步
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendWebSocketMessage({
                    type: 'getUserList',
                    timestamp: Date.now()
                });
            }
        }
    });

    window.addEventListener('beforeunload', function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendWebSocketMessage({
                type: 'offline',
                userId: currentUser,
                timestamp: Date.now()
            });
        }
    });

    // 新增：添加新消息高亮样式（封装为函数，确保初始化时加载）
    function addHighlightStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .new-message-highlight {
                animation: messagePulse 1s ease-in-out;
                background-color: rgba(0, 150, 255, 0.1) !important;
            }
            @keyframes messagePulse {
                0% { background-color: rgba(0, 150, 255, 0.3); }
                50% { background-color: rgba(0, 150, 255, 0.1); }
                100% { background-color: rgba(0, 150, 255, 0.05); }
            }
            .chat-item.unread {
                background-color: rgba(255, 59, 48, 0.05);
            }
            .chat-item.unread .chat-name,
            .chat-item.unread .chat-preview {
                font-weight: bold;
                color: #000;
            }
        `;
        document.head.appendChild(style);
    }

    // 新增：新消息高亮函数（确保切换到聊天列表时能看到动画）
    function highlightNewMessage(userId) {
        const chatItem = document.querySelector(`.chat-item[data-chat-id="${userId}"]`);
        if (chatItem) {
            // 先移除旧动画（避免重复触发时卡顿）
            chatItem.classList.remove('new-message-highlight');
            // 强制重绘后添加新动画
            setTimeout(() => {
                chatItem.classList.add('new-message-highlight');
            }, 10);
        }
    }
});

// 复制连接地址函数
function copyConnectionUrl() {
    const urlText = document.getElementById('lanConnectionUrl').textContent;
    navigator.clipboard.writeText(urlText).then(function () {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(76, 175, 80, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 10000;
        `;
        notification.textContent = '✅ 连接地址已复制到剪贴板';
        document.body.appendChild(notification);
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 2000);
    }).catch(function (err) {
        console.error('复制失败:', err);
    });
}