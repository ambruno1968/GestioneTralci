'use strict';
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');

const PWA_URL = 'https://ambruno1968.github.io/GestioneTralci/';
const OUT_DIR = path.join(__dirname, '..', 'src');
const ICON_PATH = path.join(OUT_DIR, 'icon-192.png');

async function generateQRCodes() {
  console.log(`Generating QR codes for: ${PWA_URL}`);

  // 1. Classic High-Res QR Code PNG (1024x1024)
  const qrBuffer = await QRCode.toBuffer(PWA_URL, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 1024,
    margin: 2,
    color: {
      dark: '#0b192c',
      light: '#ffffff',
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, 'qrcode.png'), qrBuffer);
  console.log('Saved src/qrcode.png');

  // 2. Vector SVG format
  const qrSvg = await QRCode.toString(PWA_URL, {
    errorCorrectionLevel: 'H',
    type: 'svg',
    margin: 2,
    color: {
      dark: '#0b192c',
      light: '#ffffff',
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, 'qrcode.svg'), qrSvg);
  console.log('Saved src/qrcode.svg');

  // 3. Branded QR Code with central GestioneTralci app icon
  const logoSize = 220;
  const badgeSize = 250;

  const centerBadgeSvg = `
  <svg width="${badgeSize}" height="${badgeSize}" viewBox="0 0 ${badgeSize} ${badgeSize}">
    <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="40" fill="#ffffff" stroke="#0284c7" stroke-width="6"/>
  </svg>
  `;
  const centerBadgeBuffer = Buffer.from(centerBadgeSvg);

  const iconBuffer = await sharp(ICON_PATH)
    .resize(logoSize, logoSize, { fit: 'contain' })
    .toBuffer();

  const combinedBadge = await sharp(centerBadgeBuffer)
    .composite([{ input: iconBuffer, gravity: 'centre' }])
    .png()
    .toBuffer();

  const brandedQrBuffer = await sharp(qrBuffer)
    .composite([{ input: combinedBadge, gravity: 'centre' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(OUT_DIR, 'qrcode-brand.png'), brandedQrBuffer);
  console.log('Saved src/qrcode-brand.png');

  // 4. Printable Flyer / Card PNG (1200x1600)
  const cardWidth = 1200;
  const cardHeight = 1600;

  const cardSvg = `
  <svg width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b192c"/>
        <stop offset="55%" stop-color="#0f3a60"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.18"/>
      </filter>
    </defs>

    <!-- Background -->
    <rect width="${cardWidth}" height="${cardHeight}" fill="#f8fafc"/>

    <!-- Header Banner -->
    <rect width="${cardWidth}" height="340" fill="url(#headerGrad)"/>
    <circle cx="150" cy="80" r="140" fill="#ffffff" opacity="0.05"/>
    <circle cx="1080" cy="260" r="180" fill="#ffffff" opacity="0.05"/>

    <!-- Header Text -->
    <text x="600" y="150" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="-1">GestioneTralci</text>
    <text x="600" y="215" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="27" font-weight="500" fill="#e0f2fe" text-anchor="middle">Anagrafica Ecclesiastica, Sacramenti &amp; Cloud Drive</text>
    <text x="600" y="265" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="400" fill="#bae6fd" text-anchor="middle">Progressive Web App (PWA) • Chiesa Come Tralci - Novara</text>

    <!-- QR Card Container with Shadow -->
    <rect x="160" y="420" width="880" height="960" rx="40" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" filter="url(#shadow)"/>

    <!-- Instruction Title -->
    <text x="600" y="490" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="700" fill="#0f172a" text-anchor="middle">Inquadra con lo smartphone</text>
    <text x="600" y="530" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="400" fill="#64748b" text-anchor="middle">Apri la fotocamera per accedere e installare l'app</text>

    <!-- Footer info in card -->
    <rect x="200" y="1250" width="800" height="70" rx="16" fill="#f0f9ff" stroke="#bae6fd" stroke-width="2"/>
    <text x="600" y="1294" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#0369a1" text-anchor="middle">https://ambruno1968.github.io/GestioneTralci/</text>

    <!-- Bottom Footer Note -->
    <text x="600" y="1450" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#334155" text-anchor="middle">Installabile su Android, iPhone, iPad e PC</text>
    <text x="600" y="1485" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="400" fill="#94a3b8" text-anchor="middle">Funziona anche offline • Sincronizzazione automatica Google Drive</text>
  </svg>
  `;

  const qrForFlyer = await sharp(brandedQrBuffer)
    .resize(660, 660)
    .toBuffer();

  const flyerBuffer = await sharp(Buffer.from(cardSvg))
    .composite([{ input: qrForFlyer, left: 270, top: 565 }])
    .png({ quality: 100 })
    .toBuffer();

  fs.writeFileSync(path.join(OUT_DIR, 'qrcode-flyer.png'), flyerBuffer);
  console.log('Saved src/qrcode-flyer.png');
}

generateQRCodes().catch((err) => {
  console.error(err);
  process.exit(1);
});
