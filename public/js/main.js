// 全局变量
let allLogs = [];
let filteredLogs = [];
let currentPage = 1;
let logsPerPage = 20;
let currentSortColumn = 'timestamp';
let currentSortDirection = 'desc';
let useDatabase = true; // 是否使用数据库API

// 初始化
$(document).ready(function() {
    // 初始化日期选择器
    $('.date-range-picker').daterangepicker({
        autoUpdateInput: false,
        locale: {
            cancelLabel: '清除',
            applyLabel: '确定',
            fromLabel: '从',
            toLabel: '至',
            customRangeLabel: '自定义',
            weekLabel: 'W',
            daysOfWeek: ['日', '一', '二', '三', '四', '五', '六'],
            monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
            firstDay: 1
        }
    });
    
    $('.date-range-picker').on('apply.daterangepicker', function(ev, picker) {
        $(this).val(picker.startDate.format('YYYY-MM-DD') + ' - ' + picker.endDate.format('YYYY-MM-DD'));
    });
    
    $('.date-range-picker').on('cancel.daterangepicker', function(ev, picker) {
        $(this).val('');
    });
    
    // 加载日志数据
    loadLogData();
    
    // 绑定搜索按钮事件
    $('#search-btn').on('click', function() {
        applyFilters();
    });
    
    // 绑定刷新按钮事件
    $('#refresh-btn').on('click', function() {
        loadLogData();
    });
    
    // 绑定导入按钮事件
    $('#import-btn').on('click', function() {
        showImportModal();
    });
    
    // 绑定导入选中文件按钮事件
    $('#import-selected-btn').on('click', function() {
        importSelectedLogFile();
    });
    
    // 绑定导入所有文件按钮事件
    $('#import-all-btn').on('click', function() {
        importAllLogFiles();
    });
    
    // 绑定导出按钮事件
    $('#export-btn').on('click', function() {
        exportResults();
    });
    
    // 绑定表头排序事件（使用事件委托）
    $(document).on('click', '.sortable', function() {
        const column = $(this).data('column');
        console.log('点击排序列:', column);
        
        // 切换排序方向
        if (currentSortColumn === column) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortDirection = 'asc';
        }
        
        console.log('排序设置:', currentSortColumn, currentSortDirection);
        
        // 更新排序指示器
        updateSortIndicators();
        
        // 如果使用数据库API，重新加载数据
        if (useDatabase) {
            loadDatabaseLogs();
        } else {
            // 否则在客户端排序并显示
            displayResults();
        }
    });
    
    // 绑定筛选条件变更事件
    $('#status-filter, #size-filter, #time-filter, #date-range').on('change', function() {
        if (useDatabase) {
            loadDatabaseLogs();
        } else {
            applyFilters();
        }
    });
    
    // 绑定搜索框回车事件
    $('#search-input').on('keypress', function(e) {
        if (e.which === 13) {
            if (useDatabase) {
                loadDatabaseLogs();
            } else {
                applyFilters();
            }
        }
    });
    
    // 导入日志到数据库
    importLogsToDatabase();
});

// 导入日志到数据库
async function importLogsToDatabase(specificFile = null) {
    try {
        let response;
        
        if (specificFile) {
            // 导入指定日志文件
            response = await fetch('/api/import-log-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: specificFile.filename,
                    type: specificFile.type
                })
            });
        } else {
            // 导入所有日志文件
            response = await fetch('/api/import-logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
        
        const result = await response.json();
        console.log('导入日志结果:', result);
        
        if (result.success) {
            console.log('日志导入成功');
            return result;
        } else {
            console.error('日志导入失败:', result.message);
            // 如果导入失败，切换到文件模式
            useDatabase = false;
            return result;
        }
    } catch (error) {
        console.error('导入日志出错:', error);
        useDatabase = false;
        return { success: false, message: error.message };
    }
}

// 加载日志数据
async function loadLogData() {
    showLoading(true);
    
    try {
        // 获取统计信息
        await loadStats();
        
        if (useDatabase) {
            // 使用数据库API加载日志
            await loadDatabaseLogs();
        } else {
            // 使用文件API加载日志
            await loadFileBasedLogs();
        }
    } catch (error) {
        console.error('加载日志数据失败:', error);
        showError('加载日志数据失败: ' + error.message);
        showLoading(false);
    }
}

// 加载统计信息
async function loadStats() {
    try {
        if (useDatabase) {
            // 从数据库获取统计信息
            const response = await fetch('/api/stats');
            const result = await response.json();
            
            if (result.success) {
                const stats = result.data;
                $('#total-logs').text(stats.totalLogs);
                $('#success-logs').text(stats.successLogs);
                $('#failed-logs').text(stats.failedLogs);
                $('#total-size').text(formatFileSize(stats.totalSize));
                
                console.log('统计信息:', stats);
            } else {
                console.error('获取统计信息失败:', result.message);
            }
        }
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 从数据库加载日志
async function loadDatabaseLogs() {
    try {
        // 构建查询参数
        const params = new URLSearchParams();
        params.append('page', currentPage);
        params.append('limit', logsPerPage);
        
        // 添加筛选条件
        const statusFilter = $('#status-filter').val();
        if (statusFilter !== 'all') {
            params.append('status', statusFilter);
        }
        
        const sizeFilter = $('#size-filter').val();
        if (sizeFilter !== 'all') {
            params.append('sizeFilter', sizeFilter);
        }
        
        const timeFilter = $('#time-filter').val();
        if (timeFilter !== 'all') {
            params.append('timeFilter', timeFilter);
        }
        
        // 获取日期范围
        const startDateStr = $('#start-date').val();
        const endDateStr = $('#end-date').val();
        
        if (startDateStr && endDateStr) {
            // 确保日期格式正确
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            
            // 设置结束日期为当天的最后一毫秒，确保包含当天的所有日志
            endDate.setHours(23, 59, 59, 999);
            
            // 格式化日期为ISO字符串，确保服务器端能正确解析
            params.append('startDate', startDate.toISOString().split('T')[0]);
            params.append('endDate', endDate.toISOString().split('T')[0] + 'T23:59:59.999Z');
        }
        
        const searchText = $('#search-input').val().trim();
        if (searchText) {
            params.append('searchText', searchText);
        }
        
        // 添加排序条件
        params.append('sortColumn', currentSortColumn);
        params.append('sortDirection', currentSortDirection);
        
        // 发送请求
        const response = await fetch(`/api/logs-db?${params.toString()}`);
        const result = await response.json();
        
        if (result.success) {
            // 更新日志数据
            filteredLogs = result.data.logs;
            
            // 更新分页信息
            currentPage = result.data.pagination.page;
            const totalPages = result.data.pagination.totalPages;
            
            // 显示结果
            displayDatabaseResults(totalPages);
        } else {
            console.error('获取日志列表失败:', result.message);
            showError('获取日志列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载数据库日志失败:', error);
        showError('加载数据库日志失败: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// 显示数据库查询结果
function displayDatabaseResults(totalPages) {
    const $resultsBody = $('#results-body');
    $resultsBody.empty();
    
    if (filteredLogs.length === 0) {
        $('#no-results').removeClass('d-none');
        $('#pagination-container').addClass('d-none');
    } else {
        $('#no-results').addClass('d-none');
        $('#pagination-container').removeClass('d-none');
        
        // 添加结果行
        filteredLogs.forEach((log, index) => {
            const row = `
                <tr>
                    <td><span class="status-indicator status-${log.status}"></span> ${log.status === 'success' ? '成功' : '失败'}</td>
                    <td>${formatTimestamp(log.timestamp)}</td>
                    <td><span class="file-size-badge">${log.file_size}</span></td>
                    <td><span class="text-truncate" title="${log.src_path}">${getFileName(log.src_path)}</span></td>
                    <td><span class="text-truncate" title="${log.dst_path}">${getFileName(log.dst_path)}</span></td>
                    <td><span class="time-badge">${log.cost}ms</span></td>
                    <td>${log.status_code}</td>
                   <!-- <td><span class="text-truncate" title="${log.log_file}">${getFileName(log.log_file)}</span></td> -->
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-details" data-id="${log.id}"><i class="bi bi-info-circle"></i></button>
                    </td>
                </tr>
            `;
            $resultsBody.append(row);
        });
        
        // 绑定详情按钮事件
        $('.view-details').on('click', function() {
            const id = $(this).data('id');
            showDatabaseLogDetails(id);
        });
        
        // 更新分页
        updateDatabasePagination(totalPages);
    }
}

// 更新数据库分页控件
function updateDatabasePagination(totalPages) {
    const $pagination = $('#pagination');
    $pagination.empty();
    
    // 上一页按钮
    $pagination.append(`
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}" tabindex="-1">上一页</a>
        </li>
    `);
    
    // 页码按钮
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        $pagination.append(`
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `);
    }
    
    // 下一页按钮
    $pagination.append(`
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">下一页</a>
        </li>
    `);
    
    // 绑定分页事件
    $('.page-link').on('click', function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadDatabaseLogs();
        }
    });
}

// 显示数据库日志详情
async function showDatabaseLogDetails(id) {
    try {
        const response = await fetch(`/api/logs-db/${id}`);
        const result = await response.json();
        
        if (result.success) {
            const log = result.data;
            let detailHtml = `
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">状态:</div>
                    <div class="col-md-9">${log.status === 'success' ? '<span class="text-success">成功</span>' : '<span class="text-danger">失败</span>'}</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">时间:</div>
                    <div class="col-md-9">${formatTimestamp(log.timestamp)}</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">文件大小:</div>
                    <div class="col-md-9">${log.file_size} (${formatFileSize(log.file_size_bytes)})</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">源路径:</div>
                    <div class="col-md-9">${log.src_path}</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">目标路径:</div>
                    <div class="col-md-9">${log.dst_path}</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">耗时:</div>
                    <div class="col-md-9">${log.cost}ms</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">状态码:</div>
                    <div class="col-md-9">${log.status_code}</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">请求ID:</div>
                    <div class="col-md-9">${log.request_id}</div>
                </div>
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">MD5值:</div>
                    <div class="col-md-9">${log.md5}</div>
                </div>
            `;
            
            // 根据状态显示不同的字段
            if (log.status === 'success') {
                detailHtml += `
                    <div class="row detail-row">
                        <div class="col-md-3 detail-label">成功消息:</div>
                        <div class="col-md-9">${log.message}</div>
                    </div>
                `;
            } else {
                detailHtml += `
                    <div class="row detail-row">
                        <div class="col-md-3 detail-label">错误代码:</div>
                        <div class="col-md-9">${log.error_code}</div>
                    </div>
                    <div class="row detail-row">
                        <div class="col-md-3 detail-label">错误消息:</div>
                        <div class="col-md-9">${log.error_message}</div>
                    </div>
                `;
            }
            
            // 添加日志文件路径
            detailHtml += `
                <div class="row detail-row">
                    <div class="col-md-3 detail-label">日志文件:</div>
                    <div class="col-md-9">${log.log_file}</div>
                </div>
            `;
            
            // 显示模态框
            $('#detail-content').html(detailHtml);
            const detailModal = new bootstrap.Modal(document.getElementById('detail-modal'));
            detailModal.show();
        } else {
            console.error('获取日志详情失败:', result.message);
            showError('获取日志详情失败: ' + result.message);
        }
    } catch (error) {
        console.error('显示日志详情失败:', error);
        showError('显示日志详情失败: ' + error.message);
    }
}

// 从文件加载日志
async function loadFileBasedLogs() {
    try {
        // 获取日志文件列表
        const response = await fetch('/api/listLogs');
        const data = await response.json();
        
        // 重置日志数组
        allLogs = [];
        
        // 加载成功日志
        for (const filename of data.successFiles) {
            await loadLogFile(filename, 'success');
        }
        
        // 加载失败日志
        for (const filename of data.failedFiles) {
            await loadLogFile(filename, 'failed');
        }
        
        // 更新统计信息
        updateStats();
        
        // 应用筛选条件
        applyFilters();
    } catch (error) {
        console.error('加载日志文件失败:', error);
        throw error;
    } finally {
        showLoading(false);
    }
}

// 加载单个日志文件
async function loadLogFile(filename, type) {
    try {
        const response = await fetch(`/api/logs/${filename}`);
        const data = await response.text();
        
        // 为每行添加文件名前缀
        const prefixedData = data.split('\n')
            .map(line => `${filename},${line}`)
            .join('\n');
        
        // 解析日志
        if (type === 'success') {
            parseSuccessLogs(prefixedData);
        } else {
            parseFailedLogs(prefixedData);
        }
    } catch (error) {
        console.error(`加载日志文件失败: ${filename}`, error);
    }
}

// 解析成功日志
function parseSuccessLogs(data) {
    const lines = data.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 跳过空行
        if (!line) continue;
        
        // 跳过开始行、标题行和统计行
        if (line.includes('Start at') || 
            line.includes('[file size, md5 value, src --> dst, cost(ms), status code, success message, request id]') ||
            line.includes('Succeed count:') || 
            line.includes('Succeed bytes:') || 
            line.includes('End at')) {
            continue;
        }
        
        // 解析日志行
        const timeMatch = line.match(/^(sync_.*?\.txt,)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
        if (!timeMatch) continue;
        
        const match1 = timeMatch[1];
        const logFile = match1.replace(',','');
        const timestamp = timeMatch[2];
        const content = line.substring(match1.length+timestamp.length).trim();
        
        // 提取各个字段
        const sizeMatch = content.match(/(\d+(?:\.\d+)?(?:[KMGT]B|B)?)/i);
        const fileSize = sizeMatch ? sizeMatch[1] : 'n/a';
        
        const pathMatch = content.match(/([^,]+) --> ([^,]+),/);
        const srcPath = pathMatch ? pathMatch[1].trim() : '';
        const dstPath = pathMatch ? pathMatch[2].trim() : '';
        
        const costMatch = content.match(/cost \[(\d+)\]/);
        const cost = costMatch ? costMatch[1] : 'n/a';
        
        const statusMatch = content.match(/status \[(\d+)\]/);
        const status = statusMatch ? statusMatch[1] : 'n/a';
        
        const msgMatch = content.match(/success message \[([^\]]+)\]/);
        const message = msgMatch ? msgMatch[1] : 'n/a';
        
        const reqIdMatch = content.match(/request id \[([^\]]+)\]/);
        const requestId = reqIdMatch ? reqIdMatch[1] : 'n/a';
        
        // 创建日志对象
        if (srcPath && dstPath) {
            allLogs.push({
                timestamp: timestamp,
                status: 'success',
                fileSize: fileSize,
                srcPath: srcPath,
                dstPath: dstPath,
                cost: cost,
                statusCode: status,
                message: message,
                requestId: requestId,
                md5: 'n/a',
                errorCode: '',
                errorMessage: '',
                logFile: logFile
            });
        }
    }
}

// 解析失败日志
function parseFailedLogs(data) {
    const lines = data.split('\n');
    let startTime = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 跳过空行
        if (!line) continue;
        
        // 提取开始时间
        if (line.includes('Start at')) {
            const match = line.match(/Start at (.+)/);
            if (match) startTime = match[1];
            continue;
        }
        
        // 跳过标题行
        if (line.includes('[file size, src --> dst, cost(ms), status code, error code, error message, request id]')) {
            continue;
        }
        
        // 跳过统计行
        if (line.includes('Failed count:') || line.includes('End at')) {
            continue;
        }
        
        // 解析日志行
        const timeMatch = line.match(/^(sync_.*?\.txt,)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
        if (!timeMatch) continue;
        
        const match1 = timeMatch[1];
        const logFile = match1.replace(',','');
        const timestamp = timeMatch[2];
        const content = line.substring(match1.length+timestamp.length).trim();
        
        // 提取各个字段
        const sizeMatch = content.match(/(\d+(?:\.\d+)?[BKMGT]?)/i);
        const fileSize = sizeMatch ? sizeMatch[1] : 'n/a';
        
        const pathMatch = content.match(/([^,]+) --> ([^,]+),/);
        const srcPath = pathMatch ? pathMatch[1].trim() : '';
        const dstPath = pathMatch ? pathMatch[2].trim() : '';
        
        const costMatch = content.match(/cost \[(\d+)\]/);
        const cost = costMatch ? costMatch[1] : 'n/a';
        
        const statusMatch = content.match(/status \[(\d+)\]/);
        const status = statusMatch ? statusMatch[1] : 'n/a';
        
        const errorCodeMatch = content.match(/error code \[([^\]]+)\]/);
        const errorCode = errorCodeMatch ? errorCodeMatch[1] : '';
        
        const errorMsgMatch = content.match(/error message \[([^\]]+)\]/);
        const errorMessage = errorMsgMatch ? errorMsgMatch[1] : '';
        
        const reqIdMatch = content.match(/request id \[([^\]]+)\]/);
        const requestId = reqIdMatch ? reqIdMatch[1] : 'n/a';
        
        // 创建日志对象
        if (srcPath && dstPath) {
            allLogs.push({
                timestamp: timestamp,
                status: 'failed',
                fileSize: fileSize,
                srcPath: srcPath,
                dstPath: dstPath,
                cost: cost,
                statusCode: status,
                message: '',
                requestId: requestId,
                md5: 'n/a',
                errorCode: errorCode,
                errorMessage: errorMessage,
                logFile: logFile
            });
        }
    }
}

// 更新统计信息
function updateStats() {
    const successLogs = allLogs.filter(log => log.status === 'success');
    const failedLogs = allLogs.filter(log => log.status === 'failed');
    
    // 计算总传输量 - 只计算成功的日志
    let totalSize = 0;
    let logCount = 0;
    
    successLogs.forEach(log => {
        if (log.fileSize && log.fileSize !== 'n/a' && log.fileSize !== '0B') {
            const size = parseFileSize(log.fileSize);
            if (size > 0) {
                totalSize += size;
                logCount++;
                console.log(`累加文件: ${log.fileSize} => ${size} 字节, 当前总计: ${totalSize} 字节`);
            }
        }
    });
    
    // 更新UI
    $('#total-logs').text(allLogs.length);
    $('#success-logs').text(successLogs.length);
    $('#failed-logs').text(failedLogs.length);
    $('#total-size').text(formatFileSize(totalSize));
    
    console.log(`总传输量计算: ${logCount}个文件, 共${totalSize}字节 = ${formatFileSize(totalSize)}`);
}

// 应用筛选条件
function applyFilters() {
    // 获取筛选条件
    const filters = {
        status: $('#status-filter').val(),
        sizeFilter: $('#size-filter').val(),
        timeFilter: $('#time-filter').val(),
        searchText: $('#search-input').val().trim()
    };
    
    // 处理日期范围
    const dateRange = $('#date-range').val();
    if (dateRange) {
        const dates = dateRange.split(' - ');
        if (dates.length === 2) {
            filters.startDate = dates[0];
            filters.endDate = dates[1];
        }
    }
    
    // 如果使用数据库模式，从服务器获取筛选后的数据
    if (useDatabase) {
        loadDatabaseLogs();
        return;
    }
    
    // 否则在客户端进行筛选
    filteredLogs = allLogs.filter(log => {
        // 状态筛选
        if (filters.status !== 'all' && log.status !== filters.status) {
            return false;
        }
        
        // 文件大小筛选
        if (filters.sizeFilter !== 'all') {
            const size = parseFileSize(log.fileSize);
            if (!size) return false;
            
            switch (filters.sizeFilter) {
                case '0-1MB':
                    if (size > 1024 * 1024) return false;
                    break;
                case '1-10MB':
                    if (size < 1024 * 1024 || size > 10 * 1024 * 1024) return false;
                    break;
                case '10-100MB':
                    if (size < 10 * 1024 * 1024 || size > 100 * 1024 * 1024) return false;
                    break;
                case '100MB+':
                    if (size < 100 * 1024 * 1024) return false;
                    break;
            }
        }
        
        // 耗时筛选
        if (filters.timeFilter !== 'all' && log.cost !== 'n/a') {
            const cost = parseInt(log.cost);
            switch (filters.timeFilter) {
                case '0-100ms':
                    if (cost > 100) return false;
                    break;
                case '100-500ms':
                    if (cost < 100 || cost > 500) return false;
                    break;
                case '500ms+':
                    if (cost < 500) return false;
                    break;
            }
        }
        
        // 日期范围筛选
        if (filters.startDate && filters.endDate) {
            const startDate = moment(filters.startDate).startOf('day');
            const endDate = moment(filters.endDate).endOf('day');
            const logDate = moment(log.timestamp);
            
            if (!logDate.isBetween(startDate, endDate, null, '[]')) {
                return false;
            }
        }
        
        // 搜索文本筛选
        if (filters.searchText) {
            const searchText = filters.searchText.toLowerCase();
            const searchFields = [
                log.srcPath,
                log.dstPath,
                log.message,
                log.errorMessage,
                log.requestId,
                log.logFile
            ];
            
            return searchFields.some(field => {
                return field && field.toLowerCase().includes(searchText);
            });
        }
        
        return true;
    });
    
    // 重置分页并显示结果
    currentPage = 1;
    
    // 更新排序指示器
    updateSortIndicators();
    
    // 显示结果（内部会先排序）
    displayResults();
}

// 显示筛选结果
function displayResults() {
    // 先对数据进行排序
    sortLogs();
    
    const startIndex = (currentPage - 1) * logsPerPage;
    const endIndex = startIndex + logsPerPage;
    const pageData = filteredLogs.slice(startIndex, endIndex);
    
    const $resultsBody = $('#results-body');
    $resultsBody.empty();
    
    if (pageData.length === 0) {
        $('#no-results').removeClass('d-none');
        $('#pagination-container').addClass('d-none');
    } else {
        $('#no-results').addClass('d-none');
        $('#pagination-container').removeClass('d-none');
        
        // 添加结果行
        pageData.forEach((log, index) => {
            const row = `
                <tr>
                    <td><span class="status-indicator status-${log.status}"></span> ${log.status === 'success' ? '成功' : '失败'}</td>
                    <td>${formatTimestamp(log.timestamp)}</td>
                    <td><span class="file-size-badge">${log.fileSize}</span></td>
                    <td><span class="text-truncate" title="${log.srcPath}">${log.srcPath}</span></td>
                    <td><span class="text-truncate" title="${log.dstPath}">${log.dstPath}</span></td>
                    <td><span class="time-badge">${log.cost}ms</span></td>
                    <td>${log.statusCode}</td>
                    <td>${getFileName(log.logFile)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-details" data-index="${startIndex + index}"><i class="bi bi-info-circle"></i></button>
                    </td>
                </tr>
            `;
            $resultsBody.append(row);
        });
        
        // 绑定详情按钮事件
        $('.view-details').on('click', function() {
            const index = $(this).data('index');
            showLogDetails(filteredLogs[index]);
        });
        
        // 更新分页
        updatePagination();
    }
}

// 排序日志数据
function sortLogs() {
    filteredLogs.sort((a, b) => {
        let valueA, valueB;
        
        // 根据当前排序列获取比较值
        switch (currentSortColumn) {
            case 'status':
                valueA = a.status;
                valueB = b.status;
                break;
            case 'timestamp':
                valueA = a.timestamp;
                valueB = b.timestamp;
                break;
            case 'fileSize':
                valueA = parseFileSize(a.fileSize);
                valueB = parseFileSize(b.fileSize);
                break;
            case 'srcPath':
                valueA = a.srcPath.toLowerCase();
                valueB = b.srcPath.toLowerCase();
                break;
            case 'dstPath':
                valueA = a.dstPath.toLowerCase();
                valueB = b.dstPath.toLowerCase();
                break;
            case 'cost':
                valueA = parseInt(a.cost) || 0;
                valueB = parseInt(b.cost) || 0;
                break;
            case 'statusCode':
                valueA = parseInt(a.statusCode) || 0;
                valueB = parseInt(b.statusCode) || 0;
                break;
            default:
                valueA = a.timestamp;
                valueB = b.timestamp;
        }
        
        // 比较值并根据排序方向返回结果
        if (valueA === valueB) return 0;
        
        const result = valueA > valueB ? 1 : -1;
        return currentSortDirection === 'asc' ? result : -result;
    });
}

// 更新排序指示器
function updateSortIndicators() {
    // 移除所有排序类
    $('.sortable').removeClass('asc desc');
    
    // 添加当前排序类
    $(`.sortable[data-column="${currentSortColumn}"]`).addClass(currentSortDirection);
}

// 更新分页控件
function updatePagination() {
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    const $pagination = $('#pagination');
    $pagination.empty();
    
    // 上一页按钮
    $pagination.append(`
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}" tabindex="-1">上一页</a>
        </li>
    `);
    
    // 页码按钮
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        $pagination.append(`
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `);
    }
    
    // 下一页按钮
    $pagination.append(`
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">下一页</a>
        </li>
    `);
    
    // 绑定分页事件
    $('.page-link').on('click', function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            displayResults();
        }
    });
}

// 显示日志详情
function showLogDetails(log) {
    let detailHtml = `
        <div class="row detail-row">
            <div class="col-md-3 detail-label">状态:</div>
            <div class="col-md-9">${log.status === 'success' ? '<span class="text-success">成功</span>' : '<span class="text-danger">失败</span>'}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">时间:</div>
            <div class="col-md-9">${formatTimestamp(log.timestamp)}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">文件大小:</div>
            <div class="col-md-9">${log.fileSize}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">源路径:</div>
            <div class="col-md-9">${log.srcPath}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">目标路径:</div>
            <div class="col-md-9">${log.dstPath}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">耗时:</div>
            <div class="col-md-9">${log.cost}ms</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">状态码:</div>
            <div class="col-md-9">${log.statusCode}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">请求ID:</div>
            <div class="col-md-9">${log.requestId}</div>
        </div>
        <div class="row detail-row">
            <div class="col-md-3 detail-label">MD5值:</div>
            <div class="col-md-9">${log.md5}</div>
        </div>
    `;
    
    // 根据状态显示不同的字段
    if (log.status === 'success') {
        detailHtml += `
            <div class="row detail-row">
                <div class="col-md-3 detail-label">成功消息:</div>
                <div class="col-md-9">${log.message}</div>
            </div>
        `;
    } else {
        detailHtml += `
            <div class="row detail-row">
                <div class="col-md-3 detail-label">错误代码:</div>
                <div class="col-md-9">${log.errorCode}</div>
            </div>
            <div class="row detail-row">
                <div class="col-md-3 detail-label">错误消息:</div>
                <div class="col-md-9">${log.errorMessage}</div>
            </div>
        `;
    }
    
    // 添加日志文件路径
    detailHtml += `
        <div class="row detail-row">
            <div class="col-md-3 detail-label">日志文件:</div>
            <div class="col-md-9">${log.logFile}</div>
        </div>
    `;
    
    // 显示模态框
    $('#detail-content').html(detailHtml);
    const detailModal = new bootstrap.Modal(document.getElementById('detail-modal'));
    detailModal.show();
}

// 导出结果
function exportResults() {
    if (filteredLogs.length === 0) {
        alert('没有可导出的数据');
        return;
    }

    // 创建CSV内容
    let csvContent = '状态,时间,文件大小,源路径,目标路径,耗时(ms),状态码,请求ID,MD5值,成功/错误消息,日志文件\n';

    filteredLogs.forEach(log => {
        const status = log.status === 'success' ? '成功' : '失败';
        const message = log.status === 'success' ? log.message : log.errorMessage;
        const row = [
            status,
            formatTimestamp(log.timestamp),
            log.fileSize,
            `"${log.srcPath}"`,
            `"${log.dstPath}"`,
            log.cost,
            log.statusCode,
            log.requestId,
            log.md5,
            `"${message}"`,
            log.logFile
        ];
        csvContent += row.join(',') + '\n';
    });

    // 添加 UTF-8 BOM 头（解决中文乱码的关键）
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csvContent;

    // 创建下载链接
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `同步日志_${formatDate(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 显示/隐藏加载中
function showLoading(show) {
    if (show) {
        $('#loading').removeClass('d-none');
        $('#no-results').addClass('d-none');
    } else {
        $('#loading').addClass('d-none');
    }
}

// 显示错误信息
function showError(message) {
    alert(message);
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    return timestamp.replace('T', ' ').replace('Z', '');
}

// 格式化日期
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 获取文件名（不含路径和UUID）
function getFileName(path) {
    const filename = path.split('/').pop();
    return filename;
}

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
    const match = cleanStr.match(/(\d+(?:\.\d+)?)([KMGT]?B)?/i);
    if (!match) {
        console.log('无法解析文件大小:', sizeStr, '清理后:', cleanStr);
        return 0;
    }
    
    const size = parseFloat(match[1]);
    // 如果没有单位，默认为字节
    const unit = (match[2] || 'B').toUpperCase();
    
    const bytes = size * (units[unit] || 1);
    console.log(`解析文件大小: ${sizeStr} => ${bytes} 字节 (${size} ${unit})`);
    return bytes;
}

// 格式化字节数为可读的文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + units[i];
}

// 显示导入模态框
async function showImportModal() {
    try {
        // 清空之前的选项
        $('#log-file-select').empty().append('<option value="" selected disabled>请选择日志文件</option>');
        
        // 隐藏状态信息
        $('#import-status').addClass('d-none').removeClass('alert-success alert-danger').empty();
        
        // 获取可导入的日志文件列表
        const response = await fetch('/api/importable-logs');
        const data = await response.json();
        
        // 检查是否有可导入的文件
        const successFiles = data.success || [];
        const failedFiles = data.failed || [];
        
        if (successFiles.length === 0 && failedFiles.length === 0) {
            $('#import-status')
                .removeClass('d-none alert-success')
                .addClass('alert-info')
                .text('没有可导入的日志文件');
            
            // 禁用导入按钮
            $('#import-selected-btn, #import-all-btn').prop('disabled', true);
        } else {
            // 启用导入按钮
            $('#import-selected-btn, #import-all-btn').prop('disabled', false);
            
            // 添加成功日志文件选项
            if (successFiles.length > 0) {
                const successGroup = $('<optgroup label="成功日志"></optgroup>');
                successFiles.forEach(file => {
                    successGroup.append(`<option value="${file.filename}" data-type="success">${file.filename}</option>`);
                });
                $('#log-file-select').append(successGroup);
            }
            
            // 添加失败日志文件选项
            if (failedFiles.length > 0) {
                const failedGroup = $('<optgroup label="失败日志"></optgroup>');
                failedFiles.forEach(file => {
                    failedGroup.append(`<option value="${file.filename}" data-type="failed">${file.filename}</option>`);
                });
                $('#log-file-select').append(failedGroup);
            }
        }
        
        // 显示模态框
        const importModal = new bootstrap.Modal(document.getElementById('import-modal'));
        importModal.show();
    } catch (error) {
        console.error('获取可导入日志文件列表失败:', error);
        alert('获取可导入日志文件列表失败: ' + error.message);
    }
}

// 导入选中的日志文件
async function importSelectedLogFile() {
    try {
        const select = document.getElementById('log-file-select');
        const selectedOption = select.options[select.selectedIndex];
        
        if (!selectedOption || selectedOption.disabled) {
            $('#import-status')
                .removeClass('d-none alert-success')
                .addClass('alert-danger')
                .text('请选择要导入的日志文件');
            return;
        }
        
        const filename = selectedOption.value;
        const type = selectedOption.getAttribute('data-type');
        
        // 显示导入中状态
        $('#import-status')
            .removeClass('d-none alert-success alert-danger')
            .addClass('alert-info')
            .text(`正在导入日志文件: ${filename}...`);
        
        // 禁用导入按钮
        $('#import-selected-btn, #import-all-btn').prop('disabled', true);
        
        // 调用导入函数
        const result = await importLogsToDatabase({ filename, type });
        
        if (result.success) {
            $('#import-status')
                .removeClass('alert-info alert-danger')
                .addClass('alert-success')
                .text(`日志文件 ${filename} 导入成功`);
                
            // 从选择列表中移除已导入的文件
            selectedOption.remove();
            
            // 如果没有更多文件可导入，禁用导入按钮
            if ($('#log-file-select option').length <= 1) {
                $('#import-selected-btn, #import-all-btn').prop('disabled', true);
                $('#log-file-select').empty().append('<option value="" selected disabled>没有可导入的日志文件</option>');
            }
            
            // 刷新日志数据
            loadLogData();
        } else {
            $('#import-status')
                .removeClass('alert-info alert-success')
                .addClass('alert-danger')
                .text(`导入失败: ${result.message || '未知错误'}`);
                
            // 启用导入按钮
            $('#import-selected-btn, #import-all-btn').prop('disabled', false);
        }
    } catch (error) {
        console.error('导入日志文件失败:', error);
        $('#import-status')
            .removeClass('alert-info alert-success')
            .addClass('alert-danger')
            .text('导入失败: ' + error.message);
            
        // 启用导入按钮
        $('#import-selected-btn, #import-all-btn').prop('disabled', false);
    }
}

// 导入所有日志文件
async function importAllLogFiles() {
    try {
        // 显示导入中状态
        $('#import-status')
            .removeClass('d-none alert-success alert-danger')
            .addClass('alert-info')
            .text('正在导入所有日志文件...');
        
        // 禁用导入按钮
        $('#import-selected-btn, #import-all-btn').prop('disabled', true);
        
        // 调用导入函数
        const result = await importLogsToDatabase();
        
        if (result.success) {
            $('#import-status')
                .removeClass('alert-info alert-danger')
                .addClass('alert-success')
                .text('所有日志文件导入成功');
                
            // 清空选择列表
            $('#log-file-select').empty().append('<option value="" selected disabled>没有可导入的日志文件</option>');
            
            // 禁用导入按钮
            $('#import-selected-btn, #import-all-btn').prop('disabled', true);
            
            // 刷新日志数据
            loadLogData();
        } else {
            $('#import-status')
                .removeClass('alert-info alert-success')
                .addClass('alert-danger')
                .text(`导入失败: ${result.message || '未知错误'}`);
                
            // 启用导入按钮
            $('#import-selected-btn, #import-all-btn').prop('disabled', false);
        }
    } catch (error) {
        console.error('导入所有日志文件失败:', error);
        $('#import-status')
            .removeClass('alert-info alert-success')
            .addClass('alert-danger')
            .text('导入失败: ' + error.message);
            
        // 启用导入按钮
        $('#import-selected-btn, #import-all-btn').prop('disabled', false);
    }
}