import './sourcemap-register.cjs';/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const changelog_notification_1 = require("./changelog-notification");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            (0, core_1.debug)(`Sending notification...`);
            const slackWebhookUrl = (0, core_1.getInput)('slack_webhook_url');
            const context = github_1.context;
            const { eventName, repo } = context;
            if (eventName !== 'release') {
                (0, core_1.setFailed)('Action should only be run on release publish events');
            }
            const payload = context.payload;
            yield (0, changelog_notification_1.notifyChangelog)({
                slackWebhookUrl,
                release: payload.release,
                repo
            });
            (0, core_1.debug)('Sent notification');
        }
        catch (error) {
            if (error instanceof Error)
                (0, core_1.setFailed)(error.message);
        }
    });
}
run();


//# sourceMappingURL=index.js.map