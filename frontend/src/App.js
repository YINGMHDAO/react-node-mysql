import React, { useState, useEffect } from "react";
import { Table, Upload, Button, message, Input } from "antd";
import { UploadOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";

const App = () => {
    const [data, setData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [tableName, setTableName] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState(""); // 搜索关键字

    useEffect(() => {
        fetchData(page, search);
    }, [page, search]);

    const fetchData = async (page, search) => {
        try {
            const res = await axios.get(`http://localhost:5000/data?page=${page}&limit=${pageSize}&search=${search}`);
            if (res.data.data.length > 0) {
                const columnKeys = Object.keys(res.data.data[0]);
                setColumns(columnKeys.map(key => ({ title: key, dataIndex: key, key })));
                setData(res.data.data);
                setTableName(res.data.tableName);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error("获取数据失败", err);
        }
    };

    const uploadProps = {
        name: "file",
        action: "http://localhost:5000/upload",
        showUploadList: false,
        onChange(info) {
            if (info.file.status === "done") {
                message.success("上传成功");
                setPage(1);
                fetchData(1, search);
            } else if (info.file.status === "error") {
                message.error("上传失败");
            }
        }
    };

    return (
        <div style={{ padding: "20px" }}>
            <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />}>上传 Excel</Button>
            </Upload>

            <Input
                placeholder="输入关键字搜索"
                prefix={<SearchOutlined />}
                style={{ width: 300, margin: "20px 0" }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            <h3>当前表: {tableName}</h3>
            <Table
                dataSource={data}
                columns={columns}
                rowKey="id"
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    onChange: (page) => setPage(page)
                }}
                style={{ marginTop: "20px" }}
            />
        </div>
    );
};

export default App;
