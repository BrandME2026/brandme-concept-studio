/** Diccionario español. Claves namespaced por área de la UI. */
export const es = {
  // Metadata (layout) — SEO
  "meta.title": "Francast.ai — Marketing con IA para consultores de franquicias",
  "meta.description":
    "BrandMe construye una página completa con IA para cada marca de franquicia de tu portafolio: 100 páginas SEO, un AMA experto en la marca y agentes de captación que nunca duermen. En vivo en 4 minutos.",
  "meta.ogTitle": "Francast.ai — Lanza cada marca de franquicia con su propia IA",
  "meta.keywords":
    "marketing de franquicias, consultor de franquicias, páginas SEO, AMA, FDD, captación de leads, BrandMe, Francast",
  "meta.siteName": "Francast.ai",

  // Landing
  "landing.eyebrow": "Cuéntale tus marcas a nuestro agente",
  "landing.h1": "Cuéntanos sobre tu firma y lanzamos tu marca.",
  "landing.lead":
    "Responde unas preguntas y nuestro agente identifica la web oficial, la analiza y genera tu propuesta con un preview en vivo.",

  // Onboarding — preguntas (steps)
  "onboarding.step.name": "¿Cuál es tu nombre y el de tu firma?",
  "onboarding.step.name.placeholder": "ej. Shawn Whitaker, Whitaker Franchise",
  "onboarding.step.brand": "¿Qué marca de franquicia quieres lanzar primero?",
  "onboarding.step.first": "¿Cuál lanzamos primero?",
  "onboarding.step.markets": "¿En qué mercados te enfocas para esa marca?",
  "onboarding.step.markets.placeholder": "ej. Dallas, Plano, Frisco",
  "onboarding.step.investor": "¿Qué perfil de inversor es tu punto ideal?",
  "onboarding.step.positioning":
    "¿Cuál es tu posicionamiento? ¿Qué vendes que nadie más ofrece?",
  "onboarding.step.positioning.placeholder":
    "ej. solo Texas, owner-operator-first, enfocado en operaciones",
  "onboarding.step.confirm": "Esto es lo que sigue:",

  // Onboarding — perfiles de inversor
  "investor.firstTime": "Dueño primerizo",
  "investor.multiUnit": "Operador multi-unidad",
  "investor.successor": "Sucesor de empresa familiar",
  "investor.mix": "Una mezcla de los tres",

  // Onboarding — acciones de confirmación
  "onboarding.confirm.fdd": "Obtener el FDD de la marca",
  "onboarding.confirm.page": "Generar tu landing de franquicia",
  "onboarding.confirm.seo": "Crear 100 páginas SEO",
  "onboarding.confirm.ama": "Entrenar un agente AMA con tu oferta",
  "onboarding.confirm.cockpit": "Configurar tu cockpit de operaciones",

  // Onboarding — botones y validación
  "onboarding.send": "Enviar",
  "onboarding.continue": "Continuar",
  "onboarding.shipIt": "Sí, lánzalo →",
  "onboarding.shipping": "Lanzando…",
  "onboarding.minChars": "Escribe al menos {n} caracteres.",
  "onboarding.pickBrand": "Elige al menos una marca.",
  "onboarding.resolveFailed":
    "No identifiqué la web oficial de {brand}. Inténtalo de nuevo.",
  "onboarding.connectionFailed":
    "Fallo de conexión. Revisa tu red e inténtalo de nuevo.",

  // Studio — topbar
  "studio.back": "Volver al inicio",
  "studio.history": "Historial",
  "studio.extraction.show": "Ver diseño extraído",
  "studio.extraction.hide": "Ocultar diseño extraído",
  "studio.quality.fast": "Rápido",
  "studio.quality.high": "Alta",
  "studio.quality.title": "Calidad de generación: Rápido (Sonnet) o Alta (GPT-5.5)",
  "studio.generate": "Generar propuesta",
  "studio.generating": "Generando…",
  "studio.includes": "Incluye",
  "studio.tab.extract": "Extracción",
  "studio.tab.chat": "Chat",
  "studio.tab.preview": "Preview",

  // Studio — chat panel
  "chat.header": "Afinar diseño",
  "chat.empty":
    "Describe cómo quieres tu diseño: “más oscuro”, “tipografía serif”, “estilo minimalista”. Guiará la propuesta al pulsar Generar.",
  "chat.placeholder": "Escribe un mensaje…",
  "chat.hint": "Enter envía · Shift+Enter salto de línea",
  "chat.send": "Enviar",

  // Studio — extraction panel
  "extraction.eyebrow": "Extracción",
  "extraction.zoom": "Ampliar",
  "extraction.zoom.aria": "Ampliar captura",
  "extraction.screenshotAlt": "Captura de la web de referencia",
  "extraction.palette": "Paleta",
  "extraction.typography": "Tipografía",
  "extraction.spacing": "Espaciado",

  // Studio — extraction loading screen
  "extraction.loading.title": "Extrayendo diseño…",
  "extraction.loading.lead":
    "Renderizamos la web completa para leer sus colores, tipografía y layout reales.",
  "extraction.loading.slow":
    "Esta web tarda más de lo normal (puede ser pesada o estar protegida contra bots). Seguimos intentándolo… si falla, te avisaremos.",

  // Studio — generation progress
  "progress.eyebrow": "Generando propuesta…",
  "progress.naming": "Nombrando el sistema",
  "progress.aesthetic": "Definiendo la estética",
  "progress.palette": "Eligiendo la paleta",
  "progress.typography": "Componiendo la tipografía",
  "progress.principles": "Redactando principios",
  "progress.preview": "Maquetando el preview",
  "progress.note":
    "Puede tardar hasta un minuto. Estamos componiendo un diseño nuevo inspirado en la web, no una copia.",

  // Studio — reasoning panel (qué piensa el agente)
  "reasoning.toggle": "Ver razonamiento del agente",
  "reasoning.eyebrow": "Pensamiento del agente",
  "reasoning.narrated.start":
    "Analizando los tokens y la captura de la web original para entender su identidad visual…",
  "reasoning.narrated.palette":
    "Detecté la paleta base de la web y estoy derivando una gama que conserva su carácter sin copiarla.",
  "reasoning.narrated.typography":
    "Componiendo una jerarquía tipográfica coherente con la marca y legible en pantalla.",
  "reasoning.narrated.principles":
    "Redactando los principios de diseño que guían las decisiones del sistema.",
  "reasoning.narrated.html":
    "Maquetando el preview con Tailwind y micro-interacciones para mostrar el sistema en acción.",

  // Studio — proposal actions
  "proposal.copy": "Copiar HTML",
  "proposal.copied": "¡Copiado!",
  "proposal.download": "Descargar DESIGN.md",
  "proposal.regenerate": "Regenerar",
  "proposal.share": "Compartir",
  "proposal.shared": "¡Link copiado!",
  "proposal.publish": "Publicar",
  "proposal.publishing": "Publicando…",
  "proposal.published": "✓ Publicada",
  "proposal.publishError": "No se pudo publicar. Intenta de nuevo.",
  "hc.regenerateBrief": "Regenera la página con una variación fresca del diseño.",

  // Studio — preview responsive / pantalla completa
  "preview.device.mobile": "Móvil",
  "preview.device.tablet": "Tablet",
  "preview.device.desktop": "Escritorio",
  "preview.device.custom": "Personalizado",
  "preview.fullscreen": "Pantalla completa",
  "preview.exit": "Salir ✕",

  // Studio — error de extracción / genéricos
  "studio.extractError": "Error de extracción",
  "studio.retry": "Reintentar",

  // Studio — preview vacío (pasos guía)
  "studio.empty.step.review": "Revisa el diseño extraído",
  "studio.empty.step.refine": "Refina en el chat (opcional)",
  "studio.empty.step.generate": "Pulsa Generar propuesta",
  "studio.empty.hint": "El preview de tu diseño nuevo aparecerá aquí.",

  // Studio — etiquetas accesibles
  "extraction.zoomedAlt": "Captura ampliada de la web",
  "extraction.drawer.label": "Diseño extraído",
  "extraction.drawer.close": "Cerrar",

  // Historial
  "history.title": "Historial",
  "history.loading": "Cargando…",
  "history.loadError": "No se pudo cargar el historial",
  "history.empty": "Aún no has generado propuestas. Vuelve al inicio y crea la primera.",
  "history.create": "Crear propuesta",

  // Leads (interesados captados)
  "leads.title": "Interesados",
  "leads.loading": "Cargando interesados…",
  "leads.empty": "Aún no hay interesados. Cuando alguien contacte desde tus páginas, aparecerá aquí.",
  "leads.create": "Crear una página →",
  "leads.col.name": "Nombre",
  "leads.col.contact": "Contacto",
  "leads.col.page": "Página",
  "leads.col.message": "Mensaje",
  "leads.col.date": "Fecha",
  "leads.navLink": "📩 Interesados",

  // Home chat (interfaz conversacional full-screen)
  "hc.greeting": "¿Qué marca de franquicia quieres lanzar hoy?",
  "hc.subtitle":
    "Cuéntame de tu negocio y te armo una página completa con IA: SEO, AMA y captación de leads.",
  "hc.placeholder": "Escribe aquí… (ej. quiero lanzar Burger King en Dallas)",
  "hc.send": "Enviar",
  "hc.hint": "Enter envía · Shift+Enter salto de línea",
  "hc.mic": "Hablar",
  "hc.recording": "Grabando… (toca para parar)",
  "hc.transcribing": "Transcribiendo…",
  "hc.micError": "No se pudo acceder al micrófono",
  "hc.voiceOn": "Leer respuestas en voz",
  "hc.voiceOff": "Silenciar voz",
  "hc.attach": "Adjuntar fotos",
  "hc.logo": "Logo",
  "hc.attachHint": "Arrastra imágenes o usa el clip",
  "hc.launching": "Preparando tu página…",
  "hc.suggest1": "Quiero lanzar Burger King en Dallas",
  "hc.suggest2": "¿Cómo funciona?",
  "hc.suggest3": "Tengo varias marcas de franquicia",
  "hc.resolveFailed": "No identifiqué la web oficial de {brand}. ¿Me pasas la URL?",
  "hc.askUrl": "No pude identificar la web oficial de {brand}. Pídele al usuario la URL oficial (ej. https://...) y vuelve a llamar launchBrand con ese campo url. NO reintentes sin la URL.",
  "hc.genFailed": "No se pudo generar la página esta vez. Discúlpate brevemente y ofrece reintentar más tarde. NO vuelvas a llamar la herramienta automáticamente.",
  "hc.duplicate": "Ya existe una web para {brand} en esa ciudad. Avisa al usuario de que no se duplica y ofrece mostrarle la que ya hay. NO vuelvas a llamar la herramienta.",
  "hc.artifactEmpty": "Tu página aparecerá aquí en cuanto la generemos.",

  // Sidebar de conversaciones
  "cv.new": "Nueva conversación",
  "cv.empty": "Aún no hay conversaciones.",
  "cv.untitled": "Sin título",

  // ── Landing larga (Francast.ai) ──────────────────────────────────────────
  // Nav
  "ll.nav.howItWorks": "Cómo funciona",
  "ll.nav.gallery": "Galería",
  "ll.nav.pricing": "Precios",
  "ll.nav.faq": "Preguntas",
  "ll.nav.signIn": "Iniciar sesión",
  "ll.nav.cta": "Lanza tu BrandMe →",

  // Banner promo
  "ll.promo.text": "Listo en 4 minutos. Con garantía de devolución de 30 días.",
  "ll.promo.link": "Ver precios →",
  "ll.promo.dismiss": "Cerrar aviso",

  // Hero
  "ll.hero.eyebrow": "Marketing con IA para consultores de franquicias",
  "ll.hero.title1": "Tus marcas.",
  "ll.hero.title2": "Tus mercados.",
  "ll.hero.title3": "Trabajando para ti.",
  "ll.hero.badge": "Bloqueado por marca · Operado por consultor · Verificado con FDD",
  "ll.hero.lead":
    "BrandMe construye una página completa con IA para cada marca de franquicia de tu portafolio: 100 páginas SEO, un AMA experto en la marca y agentes de captación que nunca duermen. Añade tus marcas. Del resto nos encargamos nosotros.",
  "ll.hero.check1": "Garantía de devolución de 30 días",
  "ll.hero.check2": "Sin contrato a largo plazo",
  "ll.hero.check3": "En vivo en 4 minutos",
  "ll.hero.terminalTitle": "FRANCAST.AI · INTAKE",
  "ll.hero.viewPage": "Ver página →",
  "ll.hero.sample": "Build de muestra · Recorre páginas BrandMe reales cada 12 segundos",

  // Stats band
  "ll.stats.eyebrow": "Hecho para el consultor de franquicias que gestiona más de una marca",
  "ll.stats.seoPages": "Páginas SEO por marca",
  "ll.stats.leadResponse": "Respuesta al primer lead",
  "ll.stats.brands": "Marcas en el registro",
  "ll.stats.coverage": "Cobertura de agentes",

  // Gallery
  "ll.gallery.eyebrow": "La galería BrandMe",
  "ll.gallery.title": "Consultores reales. Franquicias reales. Resultados reales.",
  "ll.gallery.intro":
    "Cada página BrandMe la opera un consultor independiente y está bloqueada a los estándares de esa marca. Explora por categoría: cada tarjeta es una página en vivo.",
  "ll.gallery.browseAll": "Ver las {n} marcas de {category} →",
  "ll.gallery.addBrand": "Añadir una marca",
  "ll.gallery.addBrandSub": "{n} marcas de servicios más disponibles",
  "ll.gallery.ownBrand": "O tu propia marca",
  "ll.gallery.ownBrandSub": "Marcas personalizadas bienvenidas",
  // Categorías
  "ll.gallery.cat.restaurants": "Restaurantes y QSR",
  "ll.gallery.cat.fitness": "Fitness y bienestar",
  "ll.gallery.cat.services": "Servicios personales y de negocio",
  "ll.gallery.cat.other": "Otras marcas",
  // Estados de la galería real
  "ll.gallery.loading": "Cargando páginas…",
  "ll.gallery.empty": "Aún no hay páginas generadas. Crea la primera arriba.",
  "ll.gallery.emptyCta": "Empezar ahora →",
  "ll.gallery.viewPage": "Ver página →",
  "ll.gallery.count": "{n} páginas en vivo",
  // Página pública /webs
  "webs.eyebrow": "Galería pública",
  "webs.title": "Webs creadas con Francast.ai",
  "webs.intro":
    "Cada tarjeta es una página de marketing real, generada por IA y publicada en vivo. Explora las que ya existen o crea la tuya.",
  "webs.cta": "Crear la mía →",
  "webs.navLink": "🌐 Galería pública",

  // Comparativa
  "ll.compare.old.eyebrow": "Hoy · La forma antigua",
  "ll.compare.old.title": "Un sitio genérico. Todas las marcas en la misma página.",
  "ll.compare.old.1": "Sitio folleto estático, hecho una vez, nunca actualizado",
  "ll.compare.old.2": "Cada marca pelea por el mismo espacio de hero",
  "ll.compare.old.3": "Los prospectos te piden el FDD por email y esperan días",
  "ll.compare.old.4": "Sin SEO a nivel de ciudad — invisible en búsquedas locales",
  "ll.compare.old.5": "Los leads mueren en la bandeja mientras atiendes a otro cliente",
  "ll.compare.old.6": "No puedes escalar: cada marca nueva = otro mes de desarrollo",
  "ll.compare.new.eyebrow": "Con BrandMe by Francast",
  "ll.compare.new.title": "Cada marca con su página. Cada página con su propia IA.",
  "ll.compare.new.1": "Una página BrandMe por marca, generada en 4 minutos",
  "ll.compare.new.2": "100 páginas SEO de ciudad por marca, indexadas para búsqueda local",
  "ll.compare.new.3": "El agente AMA responde preguntas del FDD 24/7 — en menos de 5 min",
  "ll.compare.new.4": "Captura, calificación y nurturing de leads automatizados",
  "ll.compare.new.5": "Bloqueado por marca: ningún consultor puede romper los estándares",
  "ll.compare.new.6": "Añade una marca nueva a tu portafolio en una tarde",

  // Agentes
  "ll.agents.eyebrow": "Tu equipo de IA",
  "ll.agents.title1": "Siete agentes de IA.",
  "ll.agents.title2": "Trabajando cada marca, cada día.",
  "ll.agents.intro":
    "No son funciones. No son ajustes que configurar. Un equipo que se presenta cada mañana, gestiona tus marcas y revela resultados — sin un solo email de tu parte.",
  "ll.agents.1.title": "Estratega de marca IA",
  "ll.agents.1.desc":
    "Aprende tu portafolio, tus mercados y tu cliente ideal en una configuración de 5 minutos. Construye la base sobre la que corren los demás agentes.",
  "ll.agents.2.title": "Investigador de mercado IA",
  "ll.agents.2.desc":
    "Mapea territorios disponibles, competencia y demanda local para cada marca. (TODO cliente: confirmar copy del agente 02).",
  "ll.agents.3.title": "Constructor de páginas IA",
  "ll.agents.3.desc":
    "Genera tu página BrandMe completa — hero, FAQs, divulgaciones seguras — a partir de los materiales oficiales de la marca. En vivo en menos de una hora.",
  "ll.agents.4.title": "Motor SEO IA",
  "ll.agents.4.desc":
    "Construye 100 páginas SEO geo-dirigidas por marca. \"Abre un Great Clips en Dallas.\" Indexadas, estructuradas y posicionando mientras duermes.",
  "ll.agents.5.title": "Agente AMA IA",
  "ll.agents.5.desc":
    "Responde preguntas del FDD 24/7, citando el documento oficial. Tú dejas de ser el cuello de botella.",
  "ll.agents.6.title": "Agente de captación IA",
  "ll.agents.6.desc":
    "Captura, califica y nutre leads automáticamente, día y noche. (TODO cliente: confirmar copy del agente 06).",
  "ll.agents.7.title": "Analista de resultados IA",
  "ll.agents.7.desc":
    "Revela qué marcas, ciudades y campañas funcionan — sin que tengas que pedirlo. (TODO cliente: confirmar copy del agente 07).",
  // How it works (3 pasos en agents)
  "ll.agents.step1": "Cuéntanos sobre tus marcas en una configuración de 5 minutos — incluso desde el móvil.",
  "ll.agents.step2": "Generamos tu página, lanzamos el SEO y entrenamos el AMA. Lo ves pasar en tiempo real.",
  "ll.agents.step3": "Tú diriges las conversaciones de alto valor — el resto corre en segundo plano.",

  // Pricing (TODO cliente: precios reales)
  "ll.pricing.eyebrow": "Precios",
  "ll.pricing.title": "Un precio por marca. Sin sorpresas.",
  "ll.pricing.intro": "Empieza con una marca. Añade más cuando quieras. Cancela cuando quieras.",
  "ll.pricing.popular": "Más popular",
  "ll.pricing.perMonth": "/mes",
  "ll.pricing.starter.name": "Starter",
  "ll.pricing.starter.price": "$—",
  "ll.pricing.starter.desc": "Una marca, completamente operada.",
  "ll.pricing.starter.cta": "Empezar",
  "ll.pricing.growth.name": "Growth",
  "ll.pricing.growth.price": "$—",
  "ll.pricing.growth.desc": "Para consultores con varias marcas.",
  "ll.pricing.growth.cta": "Lanzar BrandMe",
  "ll.pricing.portfolio.name": "Portfolio",
  "ll.pricing.portfolio.price": "$—",
  "ll.pricing.portfolio.desc": "Portafolio completo, todo incluido.",
  "ll.pricing.portfolio.cta": "Hablar con ventas",
  "ll.pricing.feat.seo": "100 páginas SEO por marca",
  "ll.pricing.feat.ama": "Agente AMA 24/7",
  "ll.pricing.feat.agents": "Los 7 agentes de IA",
  "ll.pricing.feat.leads": "Captación de leads automatizada",
  "ll.pricing.feat.support": "Soporte prioritario",

  // FAQ (TODO cliente: validar)
  "ll.faq.eyebrow": "Preguntas frecuentes",
  "ll.faq.title": "Lo que los consultores preguntan.",
  "ll.faq.q1": "¿Cuánto tarda en construirse una página?",
  "ll.faq.a1":
    "Tu primera página BrandMe está en vivo en unos 4 minutos tras la configuración. Las 100 páginas SEO se indexan en las horas siguientes.",
  "ll.faq.q2": "¿Necesito el FDD de la marca?",
  "ll.faq.a2":
    "El agente AMA cita el Documento de Divulgación de Franquicia oficial y materiales públicos. Lo usamos para fundamentar las respuestas.",
  "ll.faq.q3": "¿Puedo añadir más marcas después?",
  "ll.faq.a3": "Sí. Añade una marca nueva a tu portafolio en una tarde, cuando quieras.",
  "ll.faq.q4": "¿Hay contrato a largo plazo?",
  "ll.faq.a4": "No. Sin contrato a largo plazo y puedes cancelar cuando quieras.",
  "ll.faq.q5": "¿Qué cubre la garantía de 30 días?",
  "ll.faq.a5":
    "Si no estás satisfecho en los primeros 30 días, te devolvemos el importe completo. Sin preguntas.",

  // Footer
  "ll.footer.tagline": "Marketing con IA para consultores de franquicias.",
  "ll.footer.product": "Producto",
  "ll.footer.legal": "Legal",
  "ll.footer.contact": "Contacto",
  "ll.footer.privacy": "Privacidad",
  "ll.footer.terms": "Términos",
  "ll.footer.rights": "© 2026 Francast.ai. Todos los derechos reservados.",
} as const;

export type TranslationKey = keyof typeof es;
