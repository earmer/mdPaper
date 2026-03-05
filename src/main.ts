import { createPinia } from 'pinia';
import { createApp } from 'vue';
import TDesign from 'tdesign-vue-next';
import App from '@/App.vue';
import { i18n } from '@/i18n';
import 'katex/dist/katex.min.css';
import '@/styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(TDesign);
app.mount('#app');
