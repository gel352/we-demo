const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const os = require('os');
const fs = require('fs');
const path = require('path');

// 创建1. 先定义获取192网段IP的函数（确保在服务器启动前可用）
function get192IP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (const alias of iface) {
      if (
        alias.family === 'IPv4' && 
        !alias.internal && 
        alias.address.startsWith('192.168.')
      ) {
        return alias.address; // 例如 192.168.1.105
      }
    }
  }
  throw new Error('未找到192.168.x.x网段的IP，请检查网络连接');
}

//2. 定义端口和IP（在HTTP服务器创建前初始化，确保替换占位符时可用）
const PORT = process.env.PORT || 8080;
const local192IP = get192IP(); // 获取192网段IP
const server = http.createServer();

//4. 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 存储连接的用户
const users = new Map();
// 存储消息历史
const messageHistory = new Map();

// 生成唯一ID
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 广播用户列表给所有客户端
function broadcastUserList() {
  const userList = Array.from(users.values()).map(user => ({
    id: user.id,
    name: user.name,
    avatar: user.name.charAt(0),
    online: true
  }));

  const message = JSON.stringify({
    type: 'userList',
    users: userList
  });

  users.forEach(user => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}

// 发送系统消息
function sendSystemMessage(ws, content) {
  const message = JSON.stringify({
    type: 'system',
    content: content,
    timestamp: Date.now()
  });
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

// 发送错误消息
function sendErrorMessage(ws, content) {
  const message = JSON.stringify({
    type: 'error',
    content: content,
    timestamp: Date.now()
  });
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

// 处理用户注册
function handleRegister(userId, data, ws) {
  const user = {
    id: userId,
    name: data.userName || `用户${userId.substring(0, 8)}`,
    ws: ws,
    joinTime: Date.now()
  };
  
  users.set(userId, user);
  
  // 发送欢迎消息
  sendSystemMessage(ws, `欢迎 ${user.name}！当前在线用户: ${users.size}人`);
  
  // 广播更新后的用户列表
  broadcastUserList();
}

// 处理消息发送
function handleMessage(senderId, data, ws) {
  const sender = users.get(senderId);
  if (!sender) {
    sendErrorMessage(ws, '用户未注册');
    return;
  }
  
  if (!data.to) {
    sendErrorMessage(ws, '未指定消息接收者');
    return;
  }
  
  const recipient = users.get(data.to);
  if (!recipient) {
    sendErrorMessage(ws, '接收者不在线');
    return;
  }
  
  const messageId = data.id || generateId();
  const timestamp = data.timestamp || Date.now();
  
  // 创建消息对象
  const message = {
    type: 'message',
    id: messageId,
    from: senderId,
    fromName: sender.name,
    to: data.to,
    content: data.content,
    timestamp: timestamp
  };
  
  // 存储消息历史
  if (!messageHistory.has(senderId)) {
    messageHistory.set(senderId, new Map());
  }
  if (!messageHistory.get(senderId).has(data.to)) {
    messageHistory.get(senderId).set(data.to, []);
  }
  messageHistory.get(senderId).get(data.to).push(message);
  
  // 发送给接收者
  if (recipient.ws.readyState === WebSocket.OPEN) {
    recipient.ws.send(JSON.stringify(message));
  }
  
  // 发送回执给发送者
  const ackMessage = JSON.stringify({
    type: 'ack',
    messageId: messageId,
    timestamp: Date.now()
  });
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(ackMessage);
  }
}

// 处理获取用户列表
function handleGetUserList(userId, ws) {
  broadcastUserList();
}

// 处理用户离线
function handleOffline(userId) {
  users.delete(userId);
  broadcastUserList();
}

// WebSocket 连接处理
wss.on('connection', function connection(ws, req) {
  // 从URL参数获取用户ID，或生成新的
  const parsedUrl = url.parse(req.url, true);
  let userId = parsedUrl.query.userId;
  
  if (!userId) {
    userId = `user_${generateId()}`;
  }
  
  // 存储连接
  users.set(userId, {
    id: userId,
    name: `用户${userId.substring(5, 9)}`,
    ws: ws,
    joinTime: Date.now()
  });
  
  // 发送连接成功消息
  sendSystemMessage(ws, `连接成功！你的用户ID: ${userId}`);
  
  // 广播用户列表
  broadcastUserList();
  
  // 消息处理
  ws.on('message', function incoming(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'register':
          handleRegister(userId, message, ws);
          break;
          
        case 'message':
          handleMessage(userId, message, ws);
          break;
          
        case 'getUserList':
          handleGetUserList(userId, ws);
          break;
          
        case 'ack':
          // 消息确认，不需要特殊处理
          break;
          
        case 'offline':
          handleOffline(userId);
          break;
          
        default:
          sendErrorMessage(ws, `未知的消息类型: ${message.type}`);
          break;
      }
    } catch (error) {
      sendErrorMessage(ws, '消息格式错误');
    }
  });
  
  // 连接关闭处理
  ws.on('close', function() {
    users.delete(userId);
    broadcastUserList();
  });
  
  // 错误处理
  ws.on('error', function(error) {
    users.delete(userId);
    broadcastUserList();
  });
});

//5. 启动服务器（绑定到192网段IP）
server.listen(PORT, local192IP, function() {
  console.log(`✅ WebSocket 服务器已启动（仅监听192网段）`);
  console.log(`📌 局域网访问地址: http://${local192IP}:${PORT}`);
  console.log(`🔗 WebSocket连接地址: ws://${local192IP}:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', function() {
  console.log('\n正在关闭服务器...');
  
  // 通知所有客户端
  const shutdownMessage = JSON.stringify({
    type: 'system',
    content: '服务器正在关闭',
    timestamp: Date.now()
  });
  
  users.forEach(user => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(shutdownMessage);
      user.ws.close();
    }
  });
  
  server.close(function() {
    console.log('服务器已关闭');
    process.exit(0);
  });
});