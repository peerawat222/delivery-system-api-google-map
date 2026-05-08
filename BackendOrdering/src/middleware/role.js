// ทำ ใช้ได้เฉพาะแอดมิน
exports.isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'ต้องเป็น Admin เท่านั้น' });
    }
    next();
  };
  