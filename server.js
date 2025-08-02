const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const logParser = require('./utils/logParser');
const logModel = require('./models/logModel');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// 导入所有日志到数据库
app.post('/api/import-logs', async (req, res) => {
    try {
        const result = await logParser.importAllLogFiles();
        res.json({
            success: true,
            message: '日志导入成功',
            result
        });
    } catch (error) {
        console.error('导入日志出错:', error);
        res.status(500).json({
            success: false,
            message: '导入日志出错: ' + error.message
        });
    }
});

// 导入单个日志文件到数据库
app.post('/api/import-log-file', async (req, res) => {
    try {
        const { filename, type } = req.body;
        
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: '缺少文件名参数'
            });
        }
        
        // 根据类型确定文件路径
        const filePath = path.join(__dirname, 'logs', type === 'failed' ? 'failed' : 'success', filename);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: `文件不存在: ${filePath}`
            });
        }
        
        // 导入单个文件
        const result = await logParser.importLogFile(filePath, type === 'failed');
        
        res.json({
            success: true,
            message: '日志文件导入成功',
            result
        });
    } catch (error) {
        console.error('导入日志文件出错:', error);
        res.status(500).json({
            success: false,
            message: '导入日志文件出错: ' + error.message
        });
    }
});

// 导入指定日志文件到数据库的API
app.post('/api/import-log-file', async (req, res) => {
    try {
        const { filename, type } = req.body;
        
        if (!filename || !type) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少必要参数: filename和type' 
            });
        }
        
        if (type !== 'success' && type !== 'failed') {
            return res.status(400).json({ 
                success: false, 
                message: 'type参数必须为success或failed' 
            });
        }
        
        const result = await logParser.importLogFile(filename, type);
        res.json(result);
    } catch (error) {
        console.error('导入日志文件失败', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取日志统计信息
app.get('/api/stats', async (req, res) => {
    try {
        const result = await logModel.getLogStats();
        res.json(result);
    } catch (error) {
        console.error('获取统计信息失败', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取日志列表（带分页和筛选）
app.get('/api/logs-db', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        // 解析筛选条件
        const filters = {};
        
        if (req.query.status) filters.status = req.query.status;
        if (req.query.sizeFilter) filters.sizeFilter = req.query.sizeFilter;
        if (req.query.timeFilter) filters.timeFilter = req.query.timeFilter;
        if (req.query.searchText) filters.searchText = req.query.searchText;
        
        // 解析日期范围
        if (req.query.startDate && req.query.endDate) {
            filters.startDate = new Date(req.query.startDate);
            filters.endDate = new Date(req.query.endDate);
            // 将结束日期设置为当天的23:59:59
            filters.endDate.setHours(23, 59, 59, 999);
        }
        
        // 解析排序条件
        const sort = {};
        if (req.query.sortColumn) {
            sort.column = req.query.sortColumn;
            sort.direction = req.query.sortDirection || 'desc';
        }
        
        const result = await logModel.getLogs(page, limit, filters, sort);
        res.json(result);
    } catch (error) {
        console.error('获取日志列表失败', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取单个日志详情
app.get('/api/logs-db/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await logModel.getLogById(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        console.error('获取日志详情失败', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 兼容原有API
// 获取所有 sync_*.txt 日志文件名
app.get('/api/listLogs', async (req, res) => {
    try {
        // 尝试从数据库获取日志文件名
        const logFiles = await logModel.getLogFiles();
        if (logFiles && logFiles.length > 0) {
            return res.json(logFiles);
        }
        
        // 如果数据库中没有数据，则从文件系统获取
        const successDir = path.join(__dirname, 'logs', 'success');
        const failedDir = path.join(__dirname, 'logs', 'failed');
        
        const successFiles = fs.existsSync(successDir) ? fs.readdirSync(successDir) : [];
        const failedFiles = fs.existsSync(failedDir) ? fs.readdirSync(failedDir) : [];
        
        const result = {
            success: successFiles,
            failed: failedFiles
        };
        
        res.json(result);
    } catch (error) {
        console.error('获取日志文件列表失败', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取可导入的日志文件列表
app.get('/api/importable-logs', async (req, res) => {
    try {
        const successDir = path.join(__dirname, 'logs', 'success');
        const failedDir = path.join(__dirname, 'logs', 'failed');
        
        // 获取文件系统中的所有日志文件
        const successFiles = fs.existsSync(successDir) ? fs.readdirSync(successDir) : [];
        const failedFiles = fs.existsSync(failedDir) ? fs.readdirSync(failedDir) : [];
        
        // 获取已导入数据库的日志文件
        const importedFiles = await logModel.getLogFiles();
        const importedFilenames = new Set();
        
        if (importedFiles && importedFiles.length > 0) {
            // 提取已导入文件的文件名
            if (importedFiles.success) {
                importedFiles.success.forEach(file => importedFilenames.add(file));
            }
            if (importedFiles.failed) {
                importedFiles.failed.forEach(file => importedFilenames.add(file));
            }
        }
        
        // 过滤出未导入的文件
        const importableSuccessFiles = successFiles.filter(file => !importedFilenames.has(file));
        const importableFailedFiles = failedFiles.filter(file => !importedFilenames.has(file));
        
        // 构建结果对象，包含文件名和类型
        const result = {
            success: importableSuccessFiles.map(filename => ({
                filename,
                type: 'success',
                path: path.join(successDir, filename)
            })),
            failed: importableFailedFiles.map(filename => ({
                filename,
                type: 'failed',
                path: path.join(failedDir, filename)
            }))
        };
        
        res.json(result);
    } catch (error) {
        console.error('获取可导入日志文件列表失败', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 读取指定日志文件内容
app.get('/api/logs/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'logs', filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文件不存在' });
    }

    fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: '读取文件失败' });
        }
        res.send(data);
    });
});

// 启动服务器
const server = app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 防止服务器进程退出
process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});
