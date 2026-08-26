---
name: Bloqueio de submissões no frontend
description: Regra para impedir mutações duplicadas antes que o estado assíncrono da biblioteca alcance o próximo render.
---

Proteções contra duplo submit devem adquirir um bloqueio síncrono antes de iniciar a mutação e liberá-lo somente quando ela terminar; não dependa apenas do estado `isPending`.

**Why:** dois eventos no mesmo ciclo podem observar o mesmo estado React anterior e disparar requisições concorrentes, causando conflitos de versão mesmo com o botão visualmente desabilitado depois.

**How to apply:** use o bloqueio reutilizável em ações não idempotentes ou versionadas, mantendo também o estado visual de carregamento e um teste que comprove que a segunda aquisição falha até a liberação.