import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({testDir:'./tests/pilot',workers:1,timeout:60000,retries:0,
  use:{baseURL:'http://127.0.0.1:3017',headless:true,trace:'retain-on-failure'},
  webServer:[
    {command:'node ../../qa/pilot/fixture-server.mjs',url:'http://127.0.0.1:4017/health',reuseExistingServer:false},
    {command:'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3017',cwd:resolve(__dirname,'../pilot'),url:'http://127.0.0.1:3017/',timeout:120000,reuseExistingServer:false,
      env:{NEXT_BUILD_DIR:'.next/pilot-browser-test',NEXT_PUBLIC_API_BASE_URL:'http://127.0.0.1:4017/v1',NEXT_PUBLIC_SITE_ID:'tripc-pilot',NEXT_PUBLIC_GA4_MEASUREMENT_ID:'G-TESTONLY',NEXT_TELEMETRY_DISABLED:'1'}},
  ],
});
