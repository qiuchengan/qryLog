const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// 解析文件大小为字节数
function parseFileSize(sizeStr) {
    if (!sizeStr || sizeStr === 'n/a' || sizeStr === '0B') return 0;
    
    // 尝试清理输入字符串，移除非法字符
    const cleanStr = sizeStr.trim().replace(/[^0-9\.KMGTB]/gi, '');
    
    const units = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'TB': 1024 * 1024 * 1024 * 1024
    };
    
    // 使用更宽松的正则表达式匹配数字和单位
    const match = cleanStr.match(/([\d\.]+)([KMGT]?B)?/i);
    if (!match) {
        console.log('无法解析文件大小:', sizeStr, '清理后:', cleanStr);
        return 0;
    }
    
    const size = parseFloat(match[1]);
    // 如果没有单位，默认为字节
    const unit = (match[2] || 'B').toUpperCase();
    
    return size * (units[unit] || 1);
}

// 解析成功日志文件
async function parseSuccessLogFile(filePath, logFileId) {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const lines = data.split('\n');
        const logs = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 跳过空行、开始行、标题行和统计行
            if (!line || 
                line.includes('Start at') || 
                line.includes('[file size, md5 value, src --> dst, cost(ms), status code, success message, request id]') ||
                line.includes('Succeed count:') || 
                line.includes('Succeed bytes:') || 
                line.includes('End at')) {
                continue;
            }
            
            // 解析日志行
            const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
            if (!timeMatch) continue;
            
            const timestamp = timeMatch[1];
            const content = line.substring(timestamp.length).trim();
            
            // 提取各个字段
            const sizeMatch = content.match(/(\d+(?:\.\d+)?(?:[KMGT]B|B)?)/i);
            const fileSize = sizeMatch ? sizeMatch[1] : 'n/a';
            const fileSizeBytes = parseFileSize(fileSize);
            
            const pathMatch = content.match(/([^,]+) --> ([^,]+),/);
            const srcPath = pathMatch ? pathMatch[1].trim() : '';
            const dstPath = pathMatch ? pathMatch[2].trim() : '';
            
            const costMatch = content.match(/cost \[(\d+)\]/);
            const cost = costMatch ? parseInt(costMatch[1]) : null;
            
            const statusMatch = content.match(/status \[(\d+)\]/);
            const statusCode = statusMatch ? statusMatch[1] : 'n/a';
            
            const msgMatch = content.match(/success message \[([^\]]+)\]/);
            const message = msgMatch ? msgMatch[1] : 'n/a';
            
            const reqIdMatch = content.match(/request id \[([^\]]+)\]/);
            const requestId = reqIdMatch ? reqIdMatch[1] : 'n/a';
            
            const md5Match = content.match(/([^,]+), ([^,]+), ([^,]+) --> /);
            const md5 = md5Match && md5Match[2] !== 'n/a' ? md5Match[2] : 'n/a';
            
            // 创建日志对象
            if (srcPath && dstPath) {
                logs.push([
                    logFileId,
                    new Date(timestamp.replace('Z', '')),
                    'success',
                    fileSize,
                    fileSizeBytes,
                    srcPath,
                    dstPath,
                    cost,
                    statusCode,
                    message,
                    requestId,
                    md5,
                    null,
                    null
                ]);
            }
        }
        
        return logs;
    } catch (error) {
        console.error(`解析成功日志文件失败: ${filePath}`, error);
        return [];
    }
}

// 解析失败日志文件
async function parseFailedLogFile(filePath, logFileId) {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const lines = data.split('\n');
        const logs = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 跳过空行、开始行、标题行和统计行
            if (!line || 
                line.includes('Start at') || 
                line.includes('[file size, src --> dst, cost(ms), status code, error code, error message, request id]') ||
                line.includes('Failed count:') || 
                line.includes('End at')) {
                continue;
            }
            
            // 解析日志行
            const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
            if (!timeMatch) continue;
            
            const timestamp = timeMatch[1];
            const content = line.substring(timestamp.length).trim();
            
            // 提取各个字段
            const sizeMatch = content.match(/(\d+(?:\.\d+)?[BKMGT]?)/i);
            const fileSize = sizeMatch ? sizeMatch[1] : 'n/a';
            const fileSizeBytes = parseFileSize(fileSize);
            
            const pathMatch = content.match(/([^,]+) --> ([^,]+),/);
            const srcPath = pathMatch ? pathMatch[1].trim() : '';
            const dstPath = pathMatch ? pathMatch[2].trim() : '';
            
            const costMatch = content.match(/cost \[(\d+)\]/);
            const cost = costMatch ? parseInt(costMatch[1]) : null;
            
            const statusMatch = content.match(/status \[(\d+)\]/);
            const statusCode = statusMatch ? statusMatch[1] : 'n/a';
            
            const errorCodeMatch = content.match(/error code \[([^\]]+)\]/);
            const errorCode = errorCodeMatch ? errorCodeMatch[1] : '';
            
            const errorMsgMatch = content.match(/error message \[([^\]]+)\]/);
            const errorMessage = errorMsgMatch ? errorMsgMatch[1] : '';
            
            const reqIdMatch = content.match(/request id \[([^\]]+)\]/);
            const requestId = reqIdMatch ? reqIdMatch[1] : 'n/a';
            
            // 创建日志对象
            if (srcPath && dstPath || errorMessage) {
                logs.push([
                    logFileId,
                    new Date(timestamp.replace('Z', '')),
                    'failed',
                    fileSize,
                    fileSizeBytes,
                    srcPath,
                    dstPath,
                    cost,
                    statusCode,
                    null,
                    requestId,
                    'n/a',
                    errorCode,
                    errorMessage
                ]);
            }
        }
        
        return logs;
    } catch (error) {
        console.error(`解析失败日志文件失败: ${filePath}`, error);
        return [];
    }
}

// 导入日志文件到数据库
async function importLogFile(filename, type) {
    try {
        const filePath = path.join(__dirname, '../logs', filename);
        
        // 检查文件是否已导入
        const [existingFiles] = await db.query(
            'SELECT id FROM log_files WHERE filename = ?',
            [filename]
        );
        
        if (existingFiles.length > 0) {
            console.log(`日志文件已导入: ${filename}`);
            return { success: true, message: '日志文件已导入', logFileId: existingFiles[0].id };
        }
        
        // 插入日志文件记录
        const [result] = await db.query(
            'INSERT INTO log_files (filename, file_type) VALUES (?, ?)',
            [filename, type]
        );
        
        const logFileId = result.insertId;
        
        // 解析日志文件并获取日志记录
        let logs = [];
        if (type === 'success') {
            logs = await parseSuccessLogFile(filePath, logFileId);
        } else {
            logs = await parseFailedLogFile(filePath, logFileId);
        }
        
        if (logs.length === 0) {
            return { success: true, message: '日志文件已导入，但未找到有效日志记录', logFileId };
        }
        
        // 批量插入日志记录
        const placeholders = logs.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = logs.flat();
        
        await db.query(
            `INSERT INTO logs (log_file_id, timestamp, status, file_size, file_size_bytes, src_path, dst_path, cost, status_code, message, request_id, md5, error_code, error_message) VALUES ${placeholders}`,
            values
        );
        
        // 删除源日志文件
        try {
            fs.unlinkSync(filePath);
            console.log(`已删除源日志文件: ${filePath}`);
        } catch (deleteError) {
            console.error(`删除源日志文件失败: ${filePath}`, deleteError);
            // 即使删除失败，仍然返回导入成功
        }
        
        return { 
            success: true, 
            message: `成功导入日志文件: ${filename}，共${logs.length}条记录，并已删除源文件`, 
            logFileId,
            recordCount: logs.length
        };
    } catch (error) {
        console.error(`导入日志文件失败: ${filename}`, error);
        return { success: false, message: `导入日志文件失败: ${error.message}` };
    }
}

// 导入所有日志文件
async function importAllLogFiles() {
    try {
        const logDir = path.join(__dirname, '../logs');
        const files = fs.readdirSync(logDir);
        
        const successFiles = files.filter(f => f.startsWith('sync_succeed'));
        const failedFiles = files.filter(f => f.startsWith('sync_failed'));
        
        const results = {
            success: [],
            failed: [],
            errors: []
        };
        
        // 导入成功日志
        for (const file of successFiles) {
            const result = await importLogFile(file, 'success');
            if (result.success) {
                results.success.push({
                    filename: file,
                    recordCount: result.recordCount || 0
                });
            } else {
                results.errors.push({
                    filename: file,
                    error: result.message
                });
            }
        }
        
        // 导入失败日志
        for (const file of failedFiles) {
            const result = await importLogFile(file, 'failed');
            if (result.success) {
                results.failed.push({
                    filename: file,
                    recordCount: result.recordCount || 0
                });
            } else {
                results.errors.push({
                    filename: file,
                    error: result.message
                });
            }
        }
        
        return {
            success: true,
            message: '日志导入完成',
            results
        };
    } catch (error) {
        console.error('导入所有日志文件失败', error);
        return { success: false, message: `导入所有日志文件失败: ${error.message}` };
    }
}

module.exports = {
    parseSuccessLogFile,
    parseFailedLogFile,
    importLogFile,
    importAllLogFiles,
    parseFileSize
};