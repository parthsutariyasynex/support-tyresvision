# Single Codebase Multi-Environment & Multi-Brand (Theme) Setup Guide
**For TyresCart & TyresVision**

આ માર્ગદર્શિકા એક જ Codebase (Single Git Repository) રાખીને **TyresCart** અને **TyresVision** બંને માટે અલગ Database, અલગ Ports, અલગ Domains, અલગ WhatsApp Webhook અને અલગ Themes (Branding) સેટ કરવા માટેની સંપૂર્ણ Step-by-Step Guide છે.

---

## 📌 મુખ્ય સિદ્ધાંત (Golden Rule)
> **કોડ હંમેશા ૧ જ રહેશે — માત્ર `.env` કોન્ફિગરેશન બદલાશે.**  
> તમારે ક્યારેય બે અલગ ફોલ્ડર કે અલગ ગિટ રેપો રાખવાની જરૂર નથી.

---

## ૧. Environment Configuration Files

Server ફોલ્ડરમાં ૨ અલગ `.env` ફાઈલો બનાવો:

### `server/.env.tyrescart`
```env
PORT=5000
DATABASE_URL="mysql://crmtcusr:<DB_PASSWORD>@localhost:3306/crmtcdb"
JWT_SECRET=<generate: openssl rand -hex 32>
WEB_ORIGIN=https://support.tyrescart.ae
APP_URL=https://support.tyrescart.ae
NEXT_PUBLIC_APP_NAME="TyresCart Support"
NEXT_PUBLIC_THEME="tyrescart"
META_APP_SECRET=
META_VERIFY_TOKEN=<your verify token>
GRAPH_API_VERSION=v21.0
```

### `server/.env.tyresvision`
```env
PORT=5001
DATABASE_URL="mysql://supportusr:<DB_PASSWORD>@localhost:3306/supportdb"
JWT_SECRET=<generate: openssl rand -hex 32>
WEB_ORIGIN=https://support.tyresvision.ae
APP_URL=https://support.tyresvision.ae
NEXT_PUBLIC_APP_NAME="TyresVision Support"
NEXT_PUBLIC_THEME="tyresvision"
META_APP_SECRET=
META_VERIFY_TOKEN=<your verify token>
GRAPH_API_VERSION=v21.0
```

---

## ૨. Multi-Brand Theming (Colors & Logo)

### [A] `client/app/layout.tsx` માં Dynamic `data-theme` સેટ કરો:
```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { APP_NAME } from '@/lib/brand';

const inter = Inter({ subsets: ['latin'] });
const theme = process.env.NEXT_PUBLIC_THEME || 'tyrescart';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={theme} className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

### [B] `client/app/globals.css` માં Theme Colors ડિફાઇન કરો:
```css
@theme {
  --color-primary: var(--brand-primary);
  --color-primary-hover: var(--brand-primary-hover);
  --color-primary-dark: var(--brand-primary-dark);
  --color-primary-soft: var(--brand-primary-soft);
  --color-primary-subtle: var(--brand-primary-subtle);
  --color-accent: var(--brand-accent);
}

/* ૧. TyresCart Theme (WhatsApp Green) */
:root, [data-theme="tyrescart"] {
  --brand-primary: #075e54;
  --brand-primary-hover: #128c7e;
  --brand-primary-dark: #043d36;
  --brand-primary-soft: #dcf8c6;
  --brand-primary-subtle: #f0f7f2;
  --brand-accent: #25d366;
}

/* ૨. TyresVision Theme (Royal Blue / અથવા કસ્ટમ કલર) */
[data-theme="tyresvision"] {
  --brand-primary: #1e40af;
  --brand-primary-hover: #2563eb;
  --brand-primary-dark: #1e3a8a;
  --brand-primary-soft: #dbeafe;
  --brand-primary-subtle: #eff6ff;
  --brand-accent: #3b82f6;
}
```

### [C] `client/lib/brand.ts` માં Logo & App Name:
```ts
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'TyresCart Support';
export const APP_THEME = process.env.NEXT_PUBLIC_THEME || 'tyrescart';

export const APP_LOGO = APP_THEME === 'tyresvision' 
  ? '/logos/tyresvision.png' 
  : '/logos/tyrescart.png';
```

---

## ૩. Local Development Scripts (`package.json`)

તમારા રૂટ `package.json` માં આ સ્ક્રિપ્ટ્સ ઉમેરી શકાય:
```json
"scripts": {
  "dev:cart": "node --env-file=server/.env.tyrescart node_modules/tsx/dist/cli.mjs server/src/index.ts",
  "dev:vision": "node --env-file=server/.env.tyresvision node_modules/tsx/dist/cli.mjs server/src/index.ts"
}
```

---

## ૪. Production PM2 Configuration (`ecosystem.config.cjs`)

સર્વર પર એક જ કોડબેઝમાંથી બંને સાઇટ્સ એકસાથે ચલાવવા માટેનું કન્ફિગરેશન:

```javascript
module.exports = {
  apps: [
    // 1. TyresCart API Server (Port 5000)
    {
      name: "tyrescart-server",
      cwd: "./server",
      script: "node",
      args: "--env-file=.env.tyrescart ../node_modules/tsx/dist/cli.mjs src/index.ts",
      env: { NODE_ENV: "production", PORT: 5000 }
    },
    // 2. TyresCart Client (Port 4000)
    {
      name: "tyrescart-client",
      cwd: "./client",
      script: "../node_modules/next/dist/bin/next",
      args: "start -p 4000",
      env: { NODE_ENV: "production", PORT: 4000, NEXT_PUBLIC_THEME: "tyrescart" }
    },
    // 3. TyresVision API Server (Port 5001)
    {
      name: "tyresvision-server",
      cwd: "./server",
      script: "node",
      args: "--env-file=.env.tyresvision ../node_modules/tsx/dist/cli.mjs src/index.ts",
      env: { NODE_ENV: "production", PORT: 5001 }
    },
    // 4. TyresVision Client (Port 4001)
    {
      name: "tyresvision-client",
      cwd: "./client",
      script: "../node_modules/next/dist/bin/next",
      args: "start -p 4001",
      env: { NODE_ENV: "production", PORT: 4001, NEXT_PUBLIC_THEME: "tyresvision" }
    }
  ]
};
```

---

## ૫. Nginx & Domain Configuration

સર્વર પર બંને અલગ ડોમેન્સ માટે Nginx Reverse Proxy:

### [A] TyresCart (`/etc/nginx/sites-available/tyrescart.conf`)
```nginx
server {
    server_name support.tyrescart.ae;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### [B] TyresVision (`/etc/nginx/sites-available/tyresvision.conf`)
```nginx
server {
    server_name support.tyresvision.ae;

    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### [C] SSL Installation (Certbot)
```bash
sudo certbot --nginx -d support.tyrescart.ae -d support.tyresvision.ae
```

---

## ૬. Meta (WhatsApp Webhook) Settings

ફેસબુક ડેવલપર કન્સોલમાં દરેક App માટે અલગ Webhook સેટ કરવું:

* **TyresCart App Webhook:**
  * Callback URL: `https://support.tyrescart.ae/webhook`
  * Verify Token: `<same value as META_VERIFY_TOKEN in that site's .env>`
* **TyresVision App Webhook:**
  * Callback URL: `https://support.tyresvision.ae/webhook`
  * Verify Token: `<same value as META_VERIFY_TOKEN in that site's .env>`

---

## ૭. Deploy Workflow (જીવનભર માટે સરળ પદ્ધતિ)

1. કોડમાં ફેરફાર માત્ર ૧ જ વાર કરવો.
2. Git Push:
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```
3. સર્વર પર એક જ વાર Deploy:
   ```bash
   git pull origin main
   pm2 reload all --update-env
   ```
> આ કમાન્ડથી બંને સાઇટ્સ પોતપોતાની થીમ અને ડેટાબેઝ સાથે આપોઆપ લાઇવ થઈ જશે.

