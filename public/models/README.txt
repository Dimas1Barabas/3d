Клади сюда 3D-модели в формате .glb

Vite раздаёт папку public/ из корня сайта, поэтому файл
  public/models/scene.glb
становится доступен по адресу
  models/scene.glb
и автоматически подгружается сценой.

Где брать бесплатные модели (формат glTF / .glb):
  - Sketchfab      https://sketchfab.com      (фильтр "Downloadable", проверяй лицензию)
  - Poly Pizza     https://poly.pizza         (бесплатные low-poly)
  - Kenney         https://kenney.nl          (игровые ассеты)
  - Quaternius     https://quaternius.com     (стильные бесплатные наборы)
  - Mixamo         https://mixamo.com         (персонажи + анимации)

Хочешь другую модель? Переименуй её в scene.glb или поменяй MODEL_URL в src/main.js.
