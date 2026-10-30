const crypto = require('crypto');
const Store = require('./store');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const Auth = {
  register({ username, password, email = '' }) {
    if (!username || !password) {
      throw new Error('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      throw new Error('Tên đăng nhập phải có ít nhất 3 ký tự.');
    }
    if (password.length < 4) {
      throw new Error('Mật khẩu phải có ít nhất 4 ký tự.');
    }

    const data = Store.readDb();
    data.users = data.users || [];
    
    // Check existing
    const exists = data.users.find(u => u.username.toLowerCase() === cleanUsername);
    if (exists) {
      throw new Error('Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const newUser = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      username: cleanUsername,
      displayName: username.trim(),
      email: email.trim(),
      passwordHash,
      salt,
      createdAt: new Date().toISOString()
    };

    data.users.push(newUser);
    Store.writeDb(data);

    // Auto login
    return this.createSession(newUser.id);
  },

  login({ username, password }) {
    if (!username || !password) {
      throw new Error('Vui lòng nhập tên đăng nhập và mật khẩu.');
    }

    const cleanUsername = username.trim().toLowerCase();
    const data = Store.readDb();
    const user = (data.users || []).find(u => u.username.toLowerCase() === cleanUsername);

    if (!user) {
      throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    return this.createSession(user.id);
  },

  createSession(userId) {
    const data = Store.readDb();
    data.sessions = data.sessions || [];

    const token = 'vz_sess_' + crypto.randomBytes(24).toString('hex');
    const session = {
      token,
      userId,
      createdAt: new Date().toISOString()
    };

    data.sessions.push(session);
    // Keep max 100 sessions
    if (data.sessions.length > 100) {
      data.sessions = data.sessions.slice(-100);
    }
    Store.writeDb(data);

    const user = data.users.find(u => u.id === userId);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email
      }
    };
  },

  getUserByToken(token) {
    if (!token) return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    const data = Store.readDb();
    const session = (data.sessions || []).find(s => s.token === cleanToken);
    if (!session) return null;

    const user = (data.users || []).find(u => u.id === session.userId);
    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email
    };
  },

  logout(token) {
    if (!token) return;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    const data = Store.readDb();
    data.sessions = (data.sessions || []).filter(s => s.token !== cleanToken);
    Store.writeDb(data);
  },

  ensureDefaultAdmin() {
    const data = Store.readDb();
    data.users = data.users || [];
    if (data.users.length === 0) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword('vince123', salt);
      data.users.push({
        id: 'usr_admin',
        username: 'vince',
        displayName: 'Vince Admin',
        email: 'vince@vincezone.local',
        passwordHash,
        salt,
        createdAt: new Date().toISOString()
      });
      Store.writeDb(data);
      console.log('Seeded default user: username "vince", password "vince123"');
    }
  }
};

module.exports = Auth;
