# Native content filtering

Engine: Ghostery `@ghostery/adblocker`, MPL-2.0, https://github.com/ghostery/adblocker.
The dependency is unmodified; its source and license remain in node_modules in the package.

EasyList and EasyPrivacy by The EasyList authors (https://easylist.to/).
Snapshots are unmodified and retained here; `engine.bin` is their compiled representation.
Distributed under CC BY-SA 3.0 (see LICENSE-EasyList.txt).
Sources: https://easylist.to/easylist/easylist.txt and https://easylist.to/easylist/easyprivacy.txt.
Compile reviewed snapshots: `node scripts/update-adblock.mjs`.
The browser can refresh these two fixed sources through Settings > Security.

Uses SponsorBlock data licensed under CC BY-NC-SA 4.0 from https://sponsor.ajay.app/.
Data remains in a bounded memory cache only. No segment submissions, votes or view statistics are sent.
API license: https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License.
License: https://creativecommons.org/licenses/by-nc-sa/4.0/.

Network interception is composed with BrowserSecurity; it does not replace Electron webRequest handlers.
Cosmetic filtering uses standard CSS hiding; scriptlets and extended selectors are not injected.
