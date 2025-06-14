// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import initRoutes from './routes/init.js'

const app = express();

// To simulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Serve static files from "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


// app.get('/', (req, res) => {
//   res.render('index', { name: 'Nika' });
// });

initRoutes(app);

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
