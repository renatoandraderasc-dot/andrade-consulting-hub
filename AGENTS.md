Mercadológicos devem ser lidos pelas funções compartilhadas de `src/lib/mercadologico.ts`, pois os conectores usam aliases diferentes para os mesmos níveis.
PIC TV validates the login-selected store through store access rules and ignores URL/display overrides; this prevents unintended cross-store display.
PIC TV weather uses browser-authorized location with Open-Meteo and degrades independently; store location is not guessed from its name.
- TV signage (tv_telas/tv_itens + private bucket tv-midia) is managed only by global admins; players at /tv/:id read through store-access RLS and are the only screens besides PIC TV allowed to auto-refresh.
