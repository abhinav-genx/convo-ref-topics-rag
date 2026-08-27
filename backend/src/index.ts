import app from "./app.js";
import { BACKEND_URL } from "./env.js";

const PORT = Number(process.env.PORT) || 3001;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API listening on ${BACKEND_URL}`);
  });
}

export default app;
