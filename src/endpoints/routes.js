import express from 'express';
import path from 'path';

export function registerRoutes(app, publicDir) {
  app.use((req, res, next) => {
    // Allow cross-origin dev access for testing; remove in production
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  app.use(express.static(publicDir));

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}
