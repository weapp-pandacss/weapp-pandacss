<script setup lang="ts">
import autoRoutes from 'weapp-vite/auto-routes'
import './app.css'
import './preprocessors/sass.scss'
import './preprocessors/less.less'
import './preprocessors/stylus.styl'

defineAppJson({
  pages: autoRoutes.pages,
  window: {
    navigationBarTitleText: 'Panda CSS + Wevu',
    navigationBarBackgroundColor: '#f8fafc',
    navigationBarTextStyle: 'black',
  },
  style: 'v2',
  sitemapLocation: 'sitemap.json',
})
</script>
