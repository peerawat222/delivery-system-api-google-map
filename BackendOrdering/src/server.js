require("dotenv").config({ path: process.env.DOTENV_PATH || ".env/.env" });
const initDb = require("./config/initDb");

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    const app = require("./app");
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Server start failed because database is not ready.");
    console.error(err);
    process.exit(1);
  });
