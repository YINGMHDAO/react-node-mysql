const express = require("express");
const mysql = require("mysql2");
const multer = require("multer");
const xlsx = require("xlsx");
const cors = require("cors");
const redis = require("redis");

const app = express();
app.use(cors());
app.use(express.json());

// 连接 Redis
const redisClient = redis.createClient();
redisClient.connect().catch(console.error);

// 连接 MySQL
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "123456",
    database: "react"
});

db.connect(err => {
    if (err) throw err;
    console.log("✅ MySQL 连接成功");
});

// 文件上传配置
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 处理文件上传
app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "请上传文件" });
    }

    // 解析 Excel 文件
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length < 2) {
        return res.status(400).json({ message: "文件格式错误，至少需要 1 行表头和 1 行数据" });
    }

    // 生成唯一表名
    const timestamp = Date.now();
    const tableName = `data_${timestamp}`;

    const headers = data[0]; // 第一行是表头
    const values = data.slice(1); // 后续行是数据

    // 创建表
    const columns = headers.map(col => `\`${col}\` VARCHAR(255)`).join(", ");
    const createTableQuery = `CREATE TABLE ${tableName} (id INT AUTO_INCREMENT PRIMARY KEY, ${columns})`;

    db.query(createTableQuery, async err => {
        if (err) return res.status(500).json({ message: "创建表失败", error: err });

        // 插入数据
        const placeholders = headers.map(() => "?").join(", ");
        const insertQuery = `INSERT INTO ${tableName} (${headers.map(col => `\`${col}\``).join(", ")}) VALUES ?`;

        db.query(insertQuery, [values], async err => {
            if (err) return res.status(500).json({ message: "插入数据失败", error: err });

            console.log(`✅ 数据成功插入到表 ${tableName}`);
            await redisClient.setEx("latest_table", 60, tableName); // 缓存最新表名
            res.json({ message: "上传成功", tableName });
        });
    });
});

// 获取分页数据（支持 Redis 缓存）
app.get("/data", async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    try {
        const latestTable = await redisClient.get("latest_table");
        if (!latestTable) {
            return res.status(500).json({ message: "未找到最新表" });
        }

        // 生成缓存 Key
        const cacheKey = `data:${latestTable}:${page}:search:${search}`;
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            console.log(`✅ 从 Redis 获取缓存: ${cacheKey}`);
            return res.json(JSON.parse(cachedData));
        }

        // 获取总数据量
        let countQuery = `SELECT COUNT(*) AS total FROM ${latestTable}`;
        let dataQuery = `SELECT * FROM ${latestTable} LIMIT ${limit} OFFSET ${offset}`;

        if (search) {
            countQuery = `SELECT COUNT(*) AS total FROM ${latestTable} WHERE CONCAT_WS(' ', ${await getColumnNames(latestTable)}) LIKE ?`;
            dataQuery = `SELECT * FROM ${latestTable} WHERE CONCAT_WS(' ', ${await getColumnNames(latestTable)}) LIKE ? LIMIT ${limit} OFFSET ${offset}`;
        }

        db.query(countQuery, [`%${search}%`], (err, countResult) => {
            if (err) return res.status(500).json({ message: "查询总数失败", error: err });

            const total = countResult[0].total;

            db.query(dataQuery, [`%${search}%`], async (err, results) => {
                if (err) return res.status(500).json({ message: "查询数据失败", error: err });

                const response = { tableName: latestTable, data: results, total };
                await redisClient.setEx(cacheKey, 60, JSON.stringify(response)); // 存入 Redis 缓存 60 秒
                res.json(response);
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "服务器错误" });
    }
});

// 获取表的所有字段名
const getColumnNames = async (tableName) => {
    return new Promise((resolve, reject) => {
        db.query(`SHOW COLUMNS FROM ${tableName}`, (err, results) => {
            if (err) reject(err);
            const columns = results.map(row => `\`${row.Field}\``).join(", ");
            resolve(columns);
        });
    });
};

// 启动服务器
app.listen(5000, () => console.log("🚀 服务器运行在 http://localhost:5000"));
