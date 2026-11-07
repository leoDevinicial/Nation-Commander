// Vite só para gravação: o mesmo do jogo, mas sem recarregar a página quando os roteiros ou as saídas mudam.
import { mergeConfig } from 'vite';
import base from '../../../vite.config.ts';
export default mergeConfig(base, { server: { watch: { ignored: ['**/scripts/video/**', '/home/user/trailer_work/**'] } } });
