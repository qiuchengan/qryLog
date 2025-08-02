const db = require('../config/db');

// 获取日志文件列表
async function getLogFiles() {
    try {
        const [rows] = await db.query(
            'SELECT id, filename, file_type, created_at FROM log_files ORDER BY created_at DESC'
        );
        
        return {
            success: true,
            data: {
                successFiles: rows.filter(row => row.file_type === 'success').map(row => row.filename),
                failedFiles: rows.filter(row => row.file_type === 'failed').map(row => row.filename)
            }
        };
    } catch (error) {
        console.error('获取日志文件列表失败', error);
        return { success: false, message: error.message };
    }
}

// 获取日志统计信息
async function getLogStats() {
    try {
        // 获取总日志数、成功数、失败数
        const [countRows] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
            FROM logs
        `);
        
        // 获取总传输量（只计算成功的日志）
        const [sizeRows] = await db.query(`
            SELECT SUM(file_size_bytes) as total_size
            FROM logs
            WHERE status = 'success' AND file_size_bytes > 0
        `);
        
        return {
            success: true,
            data: {
                totalLogs: countRows[0].total || 0,
                successLogs: countRows[0].success_count || 0,
                failedLogs: countRows[0].failed_count || 0,
                totalSize: sizeRows[0].total_size || 0
            }
        };
    } catch (error) {
        console.error('获取日志统计信息失败', error);
        return { success: false, message: error.message };
    }
}

// 构建查询条件
function buildQueryConditions(filters) {
    const conditions = [];
    const params = [];
    
    // 状态筛选
    if (filters.status && filters.status !== 'all') {
        conditions.push('status = ?');
        params.push(filters.status);
    }
    
    // 文件大小筛选
    if (filters.sizeFilter && filters.sizeFilter !== 'all') {
        switch (filters.sizeFilter) {
            case '0-1MB':
                conditions.push('file_size_bytes > 0 AND file_size_bytes <= ?');
                params.push(1024 * 1024); // 1MB
                break;
            case '1-10MB':
                conditions.push('file_size_bytes > ? AND file_size_bytes <= ?');
                params.push(1024 * 1024); // 1MB
                params.push(10 * 1024 * 1024); // 10MB
                break;
            case '10-100MB':
                conditions.push('file_size_bytes > ? AND file_size_bytes <= ?');
                params.push(10 * 1024 * 1024); // 10MB
                params.push(100 * 1024 * 1024); // 100MB
                break;
            case '100MB+':
                conditions.push('file_size_bytes > ?');
                params.push(100 * 1024 * 1024); // 100MB
                break;
        }
    }
    
    // 耗时筛选
    if (filters.timeFilter && filters.timeFilter !== 'all') {
        switch (filters.timeFilter) {
            case '0-100ms':
                conditions.push('cost > 0 AND cost <= ?');
                params.push(100);
                break;
            case '100-500ms':
                conditions.push('cost > ? AND cost <= ?');
                params.push(100);
                params.push(500);
                break;
            case '500ms+':
                conditions.push('cost > ?');
                params.push(500);
                break;
        }
    }
    
    // 日期范围筛选
    if (filters.startDate && filters.endDate) {
        conditions.push('timestamp BETWEEN ? AND ?');
        params.push(filters.startDate);
        params.push(filters.endDate);
    }
    
    // 全文检索
    if (filters.searchText && filters.searchText.trim() !== '') {
        const searchTerms = filters.searchText.trim().split(' ').filter(term => term);
        
        if (searchTerms.length > 0) {
            // 使用MATCH AGAINST进行全文检索
            const matchConditions = [];
            
            // 对每个搜索词进行MATCH AGAINST
            searchTerms.forEach(term => {
                matchConditions.push('MATCH(src_path, dst_path, message, error_message, request_id) AGAINST(? IN BOOLEAN MODE)');
                params.push(`*${term}*`); // 使用通配符进行模糊匹配
            });
            
            conditions.push(`(${matchConditions.join(' AND ')})`); 
            
            // 添加LIKE条件作为备选（当全文索引不匹配时）
            const likeConditions = [];
            searchTerms.forEach(term => {
                likeConditions.push('src_path LIKE ? OR dst_path LIKE ? OR message LIKE ? OR error_message LIKE ? OR request_id LIKE ?');
                const likeParam = `%${term}%`;
                params.push(likeParam, likeParam, likeParam, likeParam, likeParam);
            });
            
            conditions.push(`OR (${likeConditions.join(' AND ')})`); 
        }
    }
    
    return { conditions, params };
}

// 获取日志列表（带分页和筛选）
async function getLogs(page = 1, limit = 20, filters = {}, sort = {}) {
    try {
        const offset = (page - 1) * limit;
        let { conditions, params } = buildQueryConditions(filters);
        
        // 构建WHERE子句
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        // 构建ORDER BY子句
        let orderByClause = 'ORDER BY timestamp DESC';
        if (sort.column && sort.direction) {
            // 安全处理排序列名（防止SQL注入）
            const allowedColumns = ['status', 'timestamp', 'file_size_bytes', 'src_path', 'dst_path', 'cost', 'status_code'];
            const column = allowedColumns.includes(sort.column) ? sort.column : 'timestamp';
            
            // 安全处理排序方向
            const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
            
            orderByClause = `ORDER BY ${column} ${direction}`;
        }
        
        // 获取总记录数
        const countQuery = `SELECT COUNT(*) as total FROM logs ${whereClause}`;
        const [countRows] = await db.query(countQuery, params);
        const total = countRows[0].total;
        
        // 获取分页数据
        const query = `
            SELECT 
                l.id, l.timestamp, l.status, l.file_size, l.file_size_bytes, 
                l.src_path, l.dst_path, l.cost, l.status_code, l.message, 
                l.request_id, l.md5, l.error_code, l.error_message, 
                f.filename as log_file
            FROM logs l
            JOIN log_files f ON l.log_file_id = f.id
            ${whereClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;
        
        const [rows] = await db.query(query, [...params, limit, offset]);
        
        return {
            success: true,
            data: {
                logs: rows,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        };
    } catch (error) {
        console.error('获取日志列表失败', error);
        return { success: false, message: error.message };
    }
}

// 获取单个日志详情
async function getLogById(id) {
    try {
        const [rows] = await db.query(
            `SELECT 
                l.*, f.filename as log_file
            FROM logs l
            JOIN log_files f ON l.log_file_id = f.id
            WHERE l.id = ?`,
            [id]
        );
        
        if (rows.length === 0) {
            return { success: false, message: '日志记录不存在' };
        }
        
        return { success: true, data: rows[0] };
    } catch (error) {
        console.error('获取日志详情失败', error);
        return { success: false, message: error.message };
    }
}

module.exports = {
    getLogFiles,
    getLogStats,
    getLogs,
    getLogById
};