'use strict';

/**
 * Localized display names for seeded mock characters (f0c4a000-…).
 * Avatars / usernames stay on the original seed identity; only full_name shown
 * to the viewer follows the app locale.
 */

const fs = require('fs');
const path = require('path');

const MOCK_ID_RE =
  /^f0c4a000-0000-4000-8000-([0-9a-f]{12})$/i;

const SUPPORTED_LOCALES = new Set([
  'tr',
  'en',
  'es',
  'de',
  'fr',
  'it',
  'pt',
  'ru',
  'hi',
  'ko',
  'ja',
  'zh',
]);

const POOLS = {
  tr: {
    f: [
      'Ayşe', 'Elif', 'Zeynep', 'Defne', 'Ece', 'Melis', 'Selin', 'Deniz',
      'İrem', 'Ceren', 'Yağmur', 'Eylül', 'Naz', 'Sude', 'Aslı', 'Gizem',
      'Buse', 'Duru', 'Nehir', 'İpek', 'Hande', 'Pınar', 'Merve', 'Esra',
      'Betül', 'Özge', 'Cansu', 'Tuğçe', 'Burcu', 'Gamze', 'Serra', 'Lale',
      'Nil', 'Ada', 'Lara', 'Eda', 'Sena', 'Beril', 'Meltem', 'Fulya',
    ],
    m: [
      'Ahmet', 'Mehmet', 'Can', 'Emre', 'Burak', 'Kerem', 'Ege', 'Arda',
      'Yiğit', 'Berk', 'Onur', 'Cem', 'Ozan', 'Barış', 'Mert', 'Tolga',
      'Serkan', 'Hakan', 'Murat', 'Kemal', 'Ali', 'Yusuf', 'Mustafa', 'Ömer',
      'Emir', 'Kaan', 'Deniz', 'Alp', 'Tuna', 'Umut', 'Eren', 'Furkan',
      'Gökhan', 'İbrahim', 'Hasan', 'Halil', 'Volkan', 'Sinan', 'Tarık', 'Emrah',
    ],
    n: [
      'Deniz', 'Ege', 'Özgür', 'Derya', 'Yağmur', 'Umur', 'Rüzgar', 'Toprak',
      'Güneş', 'Nehir', 'Umut', 'Barış', 'Sevgi', 'Işık', 'Doğa', 'Yıldız',
    ],
    last: [
      'Yılmaz', 'Demir', 'Kaya', 'Çelik', 'Şahin', 'Yıldız', 'Aydın', 'Öztürk',
      'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Polat',
      'Aksoy', 'Erdoğan', 'Güneş', 'Bulut', 'Acar', 'Kurt', 'Özdemir', 'Avcı',
      'Tekin', 'Ünal', 'Şimşek', 'Karaca', 'Bozkurt', 'Taş', 'Yalçın', 'Ergin',
      'Sezer', 'Bayram', 'Güler', 'Akın', 'Duman', 'Soylu', 'Türkoğlu', 'İnan',
    ],
  },
  en: {
    f: [
      'Emma', 'Olivia', 'Ava', 'Sophia', 'Mia', 'Isabella', 'Charlotte', 'Amelia',
      'Harper', 'Evelyn', 'Abigail', 'Emily', 'Elizabeth', 'Sofia', 'Ella', 'Scarlett',
      'Grace', 'Chloe', 'Victoria', 'Riley', 'Aria', 'Lily', 'Aubrey', 'Zoey',
      'Penelope', 'Layla', 'Nora', 'Camila', 'Hannah', 'Lillian', 'Addison', 'Eleanor',
      'Natalie', 'Luna', 'Savannah', 'Brooklyn', 'Leah', 'Zoe', 'Stella', 'Hazel',
    ],
    m: [
      'Liam', 'Noah', 'Oliver', 'James', 'Elijah', 'William', 'Henry', 'Lucas',
      'Benjamin', 'Theodore', 'Jack', 'Levi', 'Alexander', 'Owen', 'Samuel', 'Sebastian',
      'Mateo', 'David', 'Joseph', 'Carter', 'Julian', 'Luke', 'Michael', 'Daniel',
      'Jackson', 'Mason', 'Asher', 'Leo', 'John', 'Wyatt', 'Matthew', 'Ezra',
      'Thomas', 'Charles', 'Christopher', 'Jaxon', 'Maverick', 'Josiah', 'Isaiah', 'Andrew',
    ],
    n: [
      'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Avery', 'Cameron',
      'Reese', 'Parker', 'Rowan', 'Sawyer', 'Finley', 'Hayden', 'Morgan', 'Skyler',
    ],
    last: [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
      'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
      'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
      'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    ],
  },
  de: {
    f: [
      'Anna', 'Marie', 'Sophie', 'Laura', 'Julia', 'Lena', 'Lea', 'Emma',
      'Mia', 'Hannah', 'Emily', 'Clara', 'Lina', 'Sarah', 'Nora', 'Luisa',
      'Katharina', 'Johanna', 'Lisa', 'Nina', 'Paula', 'Marlene', 'Helena', 'Greta',
      'Ida', 'Frieda', 'Amelie', 'Nele', 'Jana', 'Franziska', 'Theresa', 'Charlotte',
    ],
    m: [
      'Maximilian', 'Alexander', 'Paul', 'Leon', 'Luis', 'Lukas', 'Felix', 'Jonas',
      'Tim', 'Noah', 'Elias', 'Ben', 'Finn', 'Emil', 'Anton', 'Henry',
      'Theo', 'Oskar', 'Mats', 'Moritz', 'Niklas', 'Tobias', 'Sebastian', 'Julian',
      'David', 'Jan', 'Philipp', 'Simon', 'Fabian', 'Daniel', 'Markus', 'Stefan',
    ],
    n: [
      'Alex', 'Kim', 'Sascha', 'Robin', 'Nic', 'Toni', 'Chris', 'Sam',
      'Jamie', 'Dominique', 'Kai', 'Mika', 'Lenny', 'Quinn', 'Ari', 'Noel',
    ],
    last: [
      'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
      'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf',
      'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann',
      'Lange', 'Schmitt', 'Werner', 'Schmitz', 'Krause', 'Meier', 'Lehmann', 'Schmid',
    ],
  },
  fr: {
    f: [
      'Camille', 'Léa', 'Chloé', 'Manon', 'Inès', 'Jade', 'Louise', 'Lina',
      'Emma', 'Alice', 'Juliette', 'Zoé', 'Clara', 'Sarah', 'Lola', 'Eva',
      'Ambre', 'Rose', 'Agathe', 'Margot', 'Anna', 'Julie', 'Pauline', 'Élise',
      'Claire', 'Sophie', 'Marie', 'Jeanne', 'Lucie', 'Anaïs', 'Noémie', 'Capucine',
    ],
    m: [
      'Louis', 'Gabriel', 'Raphaël', 'Arthur', 'Lucas', 'Hugo', 'Jules', 'Léo',
      'Adam', 'Maël', 'Paul', 'Nathan', 'Ethan', 'Noah', 'Tom', 'Théo',
      'Sacha', 'Maxime', 'Antoine', 'Mathis', 'Enzo', 'Clément', 'Axel', 'Baptiste',
      'Alexandre', 'Nicolas', 'Julien', 'Romain', 'Pierre', 'Thomas', 'Olivier', 'François',
    ],
    n: [
      'Camille', 'Claude', 'Dominique', 'Sacha', 'Alix', 'Lou', 'Noa', 'Charlie',
      'Eden', 'Kim', 'Alex', 'Max', 'Sam', 'Jessie', 'Taylor', 'Quinn',
    ],
    last: [
      'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand',
      'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David',
      'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier',
      'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier', 'Faure',
    ],
  },
  es: {
    f: [
      'Sofía', 'María', 'Lucía', 'Martina', 'Paula', 'Julia', 'Emma', 'Valentina',
      'Daniela', 'Alba', 'Carmen', 'Sara', 'Carla', 'Lara', 'Nora', 'Clara',
      'Irene', 'Elena', 'Ana', 'Olivia', 'Vega', 'Aitana', 'Chloe', 'Mía',
      'Adriana', 'Noa', 'Laia', 'Candela', 'Ainhoa', 'Jimena', 'Ariadna', 'Blanca',
    ],
    m: [
      'Hugo', 'Martín', 'Lucas', 'Mateo', 'Leo', 'Daniel', 'Alejandro', 'Pablo',
      'Manuel', 'Álvaro', 'Adrián', 'David', 'Mario', 'Diego', 'Bruno', 'Oliver',
      'Thiago', 'Enzo', 'Gabriel', 'Gonzalo', 'Javier', 'Sergio', 'Carlos', 'Miguel',
      'Antonio', 'José', 'Francisco', 'Raúl', 'Iván', 'Nicolás', 'Héctor', 'Óscar',
    ],
    n: [
      'Alex', 'Cruz', 'Rey', 'Ari', 'Noa', 'Sam', 'Dani', 'Charlie',
      'Fran', 'Kim', 'Álex', 'René', 'Max', 'Lou', 'Mar', 'Sol',
    ],
    last: [
      'García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez',
      'Gómez', 'Martin', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz',
      'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez',
      'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco', 'Molina', 'Morales', 'Suárez',
    ],
  },
  it: {
    f: [
      'Sofia', 'Giulia', 'Aurora', 'Alice', 'Ginevra', 'Emma', 'Giorgia', 'Greta',
      'Beatrice', 'Anna', 'Francesca', 'Chiara', 'Sara', 'Martina', 'Viola', 'Noemi',
      'Ludovica', 'Matilde', 'Bianca', 'Camilla', 'Elena', 'Adele', 'Mia', 'Vittoria',
      'Gaia', 'Nicole', 'Rebecca', 'Asia', 'Cecilia', 'Isabel', 'Arianna', 'Serena',
    ],
    m: [
      'Leonardo', 'Francesco', 'Alessandro', 'Lorenzo', 'Mattia', 'Tommaso', 'Gabriele', 'Edoardo',
      'Riccardo', 'Andrea', 'Diego', 'Matteo', 'Giuseppe', 'Antonio', 'Federico', 'Davide',
      'Christian', 'Niccolò', 'Samuel', 'Pietro', 'Giovanni', 'Marco', 'Luca', 'Simone',
      'Filippo', 'Michele', 'Paolo', 'Stefano', 'Roberto', 'Alberto', 'Daniele', 'Fabio',
    ],
    n: [
      'Andrea', 'Alex', 'Sam', 'Kim', 'Charlie', 'Noa', 'Sasha', 'Morgan',
      'Reese', 'Finley', 'Ari', 'Lou', 'Max', 'Nico', 'Dani', 'Chris',
    ],
    last: [
      'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci',
      'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa',
      'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani',
      'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile',
    ],
  },
  pt: {
    f: [
      'Maria', 'Ana', 'Beatriz', 'Mariana', 'Lara', 'Sofia', 'Inês', 'Matilde',
      'Leonor', 'Carolina', 'Alice', 'Laura', 'Clara', 'Madalena', 'Francisca', 'Joana',
      'Camila', 'Vitória', 'Isabela', 'Helena', 'Valentina', 'Luísa', 'Júlia', 'Manuela',
      'Rafaela', 'Gabriela', 'Yasmin', 'Letícia', 'Bianca', 'Fernanda', 'Amanda', 'Bruna',
    ],
    m: [
      'João', 'Francisco', 'Martim', 'Santiago', 'Afonso', 'Tomás', 'Duarte', 'Rodrigo',
      'Miguel', 'Gabriel', 'Davi', 'Lucas', 'Pedro', 'Arthur', 'Bernardo', 'Guilherme',
      'Rafael', 'Enzo', 'Theo', 'Heitor', 'Lorenzo', 'Nicolas', 'Samuel', 'Bruno',
      'Diego', 'Felipe', 'Gustavo', 'Leonardo', 'Matheus', 'Ricardo', 'Tiago', 'André',
    ],
    n: [
      'Alex', 'Sam', 'Dani', 'Chris', 'Noa', 'Ari', 'Max', 'Kim',
      'Lou', 'Charlie', 'Taylor', 'Jordan', 'Reese', 'Quinn', 'Finley', 'Morgan',
    ],
    last: [
      'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira',
      'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes',
      'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nunes', 'Mendes',
      'Moreira', 'Cardoso', 'Teixeira', 'Correia', 'Castro', 'Azevedo', 'Pinto', 'Araújo',
    ],
  },
  ru: {
    f: [
      'Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Татьяна', 'Ирина', 'Екатерина',
      'Светлана', 'Юлия', 'Анастасия', 'Дарья', 'Полина', 'Виктория', 'Алина', 'Ксения',
      'София', 'Вероника', 'Александра', 'Валерия', 'Маргарита', 'Диана', 'Милана', 'Арина',
      'Кира', 'Ева', 'Злата', 'Варвара', 'Ульяна', 'Елизавета', 'Василиса', 'Амелия',
    ],
    m: [
      'Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём', 'Илья',
      'Кирилл', 'Михаил', 'Никита', 'Матвей', 'Роман', 'Егор', 'Арсений', 'Иван',
      'Денис', 'Евгений', 'Тимофей', 'Владислав', 'Павел', 'Константин', 'Николай', 'Олег',
      'Юрий', 'Виктор', 'Игорь', 'Антон', 'Владимир', 'Глеб', 'Лев', 'Марк',
    ],
    n: [
      'Саша', 'Женя', 'Валя', 'Толя', 'Ника', 'Алекс', 'Миша', 'Лера',
      'Дима', 'Кира', 'Рома', 'Юля', 'Слава', 'Даша', 'Макс', 'Ника',
    ],
    last: [
      'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов',
      'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров',
      'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов', 'Андреев', 'Макаров', 'Никитин',
      'Захаров', 'Зайцев', 'Соловьёв', 'Борисов', 'Яковлев', 'Григорьев', 'Романов', 'Воробьёв',
    ],
  },
  hi: {
    f: [
      'आन्या', 'आदिति', 'ईशा', 'प्रिया', 'नेहा', 'पूजा', 'रिया', 'सान्या',
      'कविता', 'मीरा', 'अनिका', 'दिव्या', 'श्रुति', 'पल्लवी', 'स्वाति', 'कीर्ति',
      'आशा', 'सीमा', 'रेखा', 'सुनीता', 'कमल', 'ज्योति', 'माया', 'गीता',
      'नंदिनी', 'तन्वी', 'ईश्वरी', 'अवनि', 'ईरा', 'मिताली', 'साक्षी', 'कव्या',
    ],
    m: [
      'आरव', 'अर्जुन', 'आदित्य', 'रोहन', 'वीर', 'करण', 'अमन', 'राहुल',
      'अमित', 'विवेक', 'सौरभ', 'निखिल', 'अभिषेक', 'राज', 'कृष्ण', 'श्रेयस',
      'देव', 'युवराज', 'ईशान', 'कबीर', 'अनंत', 'हरि', 'सुरज', 'मनोज',
      'प्रकाश', 'संजय', 'विजय', 'अनिल', 'रवि', 'दीपक', 'मोहित', 'गौरव',
    ],
    n: [
      'अरि', 'देव', 'रीति', 'कीर्ति', 'सम', 'नव्य', 'आशा', 'ईश',
      'रिया', 'तनय', 'अद्वैत', 'नेहा', 'अमन', 'जोश', 'पारि', 'आर्य',
    ],
    last: [
      'शर्मा', 'वर्मा', 'गुप्ता', 'सिंह', 'कुमार', 'पटेल', 'रेड्डी', 'नयर',
      'मेहता', 'जोशी', 'मल्होत्रा', 'कपूर', 'चोपड़ा', 'अय्यर', 'राव', 'देशपांडे',
      'बनर्जी', 'चटर्जी', 'मुखर्जी', 'दास', 'पिल्लई', 'नायर', 'खान', 'अंसारी',
      'त्रिपाठी', 'मिश्रा', 'पाण्डेय', 'तिवारी', 'यादव', 'ठाकुर', 'बसु', 'सेन',
    ],
  },
  ko: {
    f: [
      '서연', '지민', '하은', '민서', '예은', '수아', '지유', '윤서',
      '채원', '다은', '소율', '예린', '지원', '하린', '수빈', '예나',
      '은서', '지아', '서현', '아윤', '나윤', '유나', '시은', '가은',
      '혜원', '예지', '소연', '민지', '유진', '하늘', '다현', '서우',
    ],
    m: [
      '민준', '서준', '예준', '도윤', '시우', '하준', '주원', '지호',
      '준서', '건우', '현우', '우진', '선우', '연우', '정우', '지훈',
      '준혁', '성민', '태민', '동현', '재민', '승민', '민재', '준영',
      '현준', '성현', '태윤', '지환', '윤호', '도현', '시현', '재원',
    ],
    n: [
      '하늘', '바다', '구름', '별', '솔', '이슬', '달', '산',
      '강', '빛', '봄', '가을', '여름', '겨울', '별빛', '노을',
    ],
    last: [
      '김', '이', '박', '최', '정', '강', '조', '윤',
      '장', '임', '한', '오', '서', '신', '권', '황',
      '안', '송', '류', '전', '홍', '고', '문', '양',
      '손', '배', '백', '허', '유', '남', '심', '노',
    ],
  },
  ja: {
    f: [
      '陽菜', '結衣', '咲良', '美咲', '葵', '凛', '心愛', '芽依',
      '優奈', '莉子', '花', '桜', '美月', '千尋', '彩', '真央',
      '七海', '琴音', '柚希', '紗季', '美羽', '結菜', '愛', '楓',
      '鈴', 'ひなた', 'あかり', 'みお', 'えま', 'りお', 'さき', 'ゆい',
    ],
    m: [
      '陽翔', '湊', '樹', '大和', '蓮', '悠真', '朝陽', '蒼',
      '翔太', '大輝', '陸', '颯太', '健太', '拓海', '悠斗', '颯真',
      '陽太', '智也', '亮', '誠', '翔', '翼', '駿', '海斗',
      '悠人', '琉生', '陽向', '蒼大', '律', '新', '匠', '迅',
    ],
    n: [
      '陽', '空', '海', '星', '葵', '遥', '光', '和',
      '望', '翼', '凛', '奏', '結', '心', '彩', '風',
    ],
    last: [
      '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村',
      '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上',
      '木村', '林', '斎藤', '清水', '山崎', '森', '池田', '橋本',
      '阿部', '石川', '山下', '中島', '石井', '小川', '前田', '岡田',
    ],
  },
  zh: {
    f: [
      '小雨', '雨桐', '思涵', '欣怡', '诗涵', '雅婷', '梦瑶', '婉婷',
      '佳怡', '静怡', '美玲', '晓雯', '若曦', '语嫣', '心怡', '梓涵',
      '雨萱', '可馨', '一诺', '清雅', '依琳', '雪晴', '慧敏', '丽华',
      '婷婷', '倩倩', '娜娜', '芳芳', '秀英', '玉兰', '晓燕', '静雯',
    ],
    m: [
      '浩然', '子轩', '宇轩', '俊杰', '明轩', '天佑', '志强', '建国',
      '伟', '强', '磊', '军', '勇', '涛', '超', '鹏',
      '昊', '博', '晨', '宇', '轩', '泽', '涵', '睿',
      '俊', '凯', '航', '翔', '龙', '虎', '峰', '岩',
    ],
    n: [
      '安然', '清风', '明朗', '云舒', '星辰', '沐阳', '知夏', '予安',
      '一凡', '无忧', '乐然', '欣然', '景行', '逸尘', '清欢', '听雨',
    ],
    last: [
      '王', '李', '张', '刘', '陈', '杨', '赵', '黄',
      '周', '吴', '徐', '孙', '马', '朱', '胡', '郭',
      '何', '林', '高', '罗', '郑', '梁', '谢', '宋',
      '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾',
    ],
  },
};

const FAMILY_FIRST = new Set(['ko', 'ja', 'zh']);

let _chars = null;

function loadChars() {
  if (_chars) return _chars;
  const p = path.join(__dirname, '../scripts/data/mock-chars.json');
  _chars = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _chars;
}

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  const short = raw.split('-')[0];
  if (SUPPORTED_LOCALES.has(raw)) return raw;
  if (SUPPORTED_LOCALES.has(short)) return short;
  return 'en';
}

function mockIndexFromUserId(userId) {
  const m = String(userId || '').match(MOCK_ID_RE);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}

function isMockUserId(userId) {
  return mockIndexFromUserId(userId) != null;
}

function genderKey(gender) {
  const g = String(gender || '');
  if (/^Kadın/i.test(g) || /^Female/i.test(g)) return 'f';
  if (/^Erkek/i.test(g) || /^Male/i.test(g)) return 'm';
  return 'n';
}

function buildName(index, locale, gender) {
  const loc = normalizeLocale(locale);
  const pool = POOLS[loc] || POOLS.en;
  const gk = genderKey(gender);
  const firsts = pool[gk] || pool.n || pool.m;
  const lasts = pool.last;
  const first = firsts[index % firsts.length];
  const last = lasts[(index * 17 + 3) % lasts.length];
  if (FAMILY_FIRST.has(loc)) {
    return `${last}${first}`;
  }
  return `${first} ${last}`;
}

function localizedMockName(userId, locale, fallback = '') {
  const index = mockIndexFromUserId(userId);
  if (index == null) return fallback || '';

  const chars = loadChars();
  const char = chars[index];
  if (!char) return fallback || '';

  const loc = normalizeLocale(locale);
  if (loc === 'en') {
    return String(char.name || fallback || '').trim() || fallback || '';
  }

  return buildName(index, loc, char.gender);
}

function localizeMockNameFields(obj, {
  userIdKey = 'userId',
  locale,
} = {}) {
  if (!obj || typeof obj !== 'object') return obj;
  const { getRequestLocale } = require('./requestContext');
  const loc = normalizeLocale(locale || getRequestLocale('en'));
  const uid =
    obj[userIdKey] ||
    obj.user_id ||
    obj.senderId ||
    obj.peerUserId ||
    obj.actorUserId ||
    obj.authorUserId ||
    '';
  if (!isMockUserId(uid)) return obj;

  const localized = localizedMockName(uid, loc);
  if (!localized) return obj;

  if ('name' in obj) obj.name = localized;
  if ('fullName' in obj) obj.fullName = localized;
  if ('senderName' in obj) obj.senderName = localized;
  if ('full_name' in obj) obj.full_name = localized;
  if ('actor_name' in obj) obj.actor_name = localized;
  if ('author_name' in obj) obj.author_name = localized;
  if ('authorName' in obj) obj.authorName = localized;
  if ('peerName' in obj) obj.peerName = localized;

  return obj;
}

function allLocalizedNamesForUser(userId) {
  const index = mockIndexFromUserId(userId);
  if (index == null) return [];
  const chars = loadChars();
  const char = chars[index];
  if (!char) return [];
  const names = new Set();
  names.add(String(char.name || '').trim().toLowerCase());
  for (const loc of SUPPORTED_LOCALES) {
    const n = localizedMockName(userId, loc);
    if (!n) continue;
    names.add(n.toLowerCase());
    if (FAMILY_FIRST.has(loc) && n.length >= 2) {
      // given name after 1-char family surname
      names.add(n.slice(1).toLowerCase());
    } else {
      const first = n.split(/\s+/)[0] || '';
      if (first) names.add(first.toLowerCase());
    }
  }
  return [...names].filter(Boolean);
}

module.exports = {
  SUPPORTED_LOCALES,
  normalizeLocale,
  isMockUserId,
  mockIndexFromUserId,
  localizedMockName,
  localizeMockNameFields,
  allLocalizedNamesForUser,
};
